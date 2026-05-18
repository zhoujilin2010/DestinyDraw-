"use strict";
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
/* ══════════════════════════════════════════════════════════════
   K8 校准 —— Node.js 命令行版（快速版）
   使用快速偏置 Fisher-Yates 洗牌，统计结果与 web worker 等价
   ══════════════════════════════════════════════════════════════ */

var __dirname = dirname(fileURLToPath(import.meta.url));

function k8FastDraw(count, max) {
    var pool = new Array(max);
    for (var i = 0; i < max; i++) pool[i] = i + 1;
    for (var i = 0; i < count; i++) {
        var j = i + ((Math.random() * (max - i)) | 0);
        if (j !== i) { var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    }
    var drawn = pool.slice(0, count);
    drawn.sort(function(a, b) { return a - b; });
    return drawn;
}

function k8Validate(numbers, oeRatios, bsRatios) {
    if (oeRatios && oeRatios.length > 0) {
        var odd = 0, even = 0;
        for (var i = 0; i < numbers.length; i++) numbers[i] % 2 ? odd++ : even++;
        var ok = false;
        for (var o = 0; o < oeRatios.length; o++) {
            var p = oeRatios[o].split(':');
            var a = parseInt(p[0], 10), b = parseInt(p[1], 10);
            if ((odd === a && even === b) || (odd === b && even === a)) { ok = true; break; }
        }
        if (!ok) return false;
    }
    if (bsRatios && bsRatios.length > 0) {
        var big = 0, small = 0;
        for (var i = 0; i < numbers.length; i++) numbers[i] >= 41 ? big++ : small++;
        var ok = false;
        for (var b = 0; b < bsRatios.length; b++) {
            var p = bsRatios[b].split(':');
            var a = parseInt(p[0], 10), bv = parseInt(p[1], 10);
            if ((big === a && small === bv) || (big === bv && small === a)) { ok = true; break; }
        }
        if (!ok) return false;
    }
    return true;
}

/* ── 加载本地缓存数据 ── */
function loadLocalDraws() {
    var filePath = join(__dirname, '..', 'data', 'k8.json');
    console.log('加载本地数据: ' + filePath);
    var raw = readFileSync(filePath, 'utf-8');
    var data = JSON.parse(raw);
    if (data.draws && Array.isArray(data.draws)) {
        console.log('加载成功: ' + data.draws.length + ' 期数据');
        return data.draws;
    }
    throw new Error('数据格式错误');
}

function calibrate(draws, oeRatios, bsRatios) {
    var MAX_BETS = 100000;
    var TARGET = 14;
    var hitCount = 0;
    var results = [];
    var start = Date.now();

    for (var i = 0; i < draws.length; i++) {
        var draw = draws[i];
        var set = {};
        for (var s = 0; s < draw.red.length; s++) set[draw.red[s]] = true;

        var valid = 0, hitPeriod = null, maxO = 0;
        for (var att = 0; att < MAX_BETS * 2000 && valid < MAX_BETS; att++) {
            var bet = k8FastDraw(20, 80);
            if (k8Validate(bet, oeRatios, bsRatios)) {
                valid++;
                var ov = 0;
                for (var b = 0; b < bet.length; b++) { if (set[bet[b]]) ov++; }
                if (ov > maxO) maxO = ov;
                if (ov >= TARGET) { hitPeriod = valid; hitCount++; break; }
            }
        }
        results.push({ period: hitPeriod, maxO: maxO });

        if ((i + 1) % 10 === 0 || i === draws.length - 1) {
            var pct = ((i + 1) / draws.length * 100).toFixed(1);
            var el = ((Date.now() - start) / 1000).toFixed(0);
            process.stdout.write('\r[' + pct + '%] ' + (i + 1) + '/' + draws.length + '  · 达标 ' + hitCount + ' 期  · ' + el + 's');
        }
    }
    console.log('');

    var hitResults = [];
    for (var r = 0; r < results.length; r++) { if (results[r].period !== null) hitResults.push(results[r]); }
    var avgPeriod = null;
    if (hitResults.length > 0) {
        var sum = 0;
        for (var s = 0; s < hitResults.length; s++) sum += hitResults[s].period;
        avgPeriod = Math.round(sum / hitResults.length);
    }
    return { averagePeriod: avgPeriod, hitCount: hitCount, totalDraws: draws.length, timestamp: Date.now() };
}

async function main() {
    console.log('=== 快乐8校准工具 (CLI) ===');
    var oeRatios = ['10:10', '9:11', '11:9', '12:8', '8:12', '13:7', '7:13'];
    var bsRatios = ['10:10', '9:11', '11:9', '12:8', '8:12', '13:7', '7:13'];
    console.log('筛选条件: 奇偶比 [' + oeRatios.join(',') + ']  大小比 [' + bsRatios.join(',') + ']');
    var draws = loadLocalDraws();
    console.log('开始校准 (' + draws.length + ' 期, 每期最多' + (100000).toLocaleString() + '有效注, 目标≥14/20)...');
    var result = calibrate(draws, oeRatios, bsRatios);
    var totalTime = ((Date.now() - result.timestamp) / 1000).toFixed(0);
    console.log('');
    console.log('=== 校准完成 ===');
    console.log('平均命中期数: ' + (result.averagePeriod ?? '—'));
    console.log('达标: ' + result.hitCount + '/' + result.totalDraws + ' 期 (' + (result.hitCount/result.totalDraws*100).toFixed(1) + '%)');
    console.log('耗时: ' + totalTime + 's');
    return result;
}

main().then(function(r) {
    var data = { averagePeriod: r.averagePeriod, totalDraws: r.totalDraws, hitDraws: r.hitCount, timestamp: r.timestamp };
    var json = JSON.stringify(data, null, 2);
    console.log('');
    console.log('结果 JSON:');
    console.log(json);
    var assetsDir = join(__dirname, '..', 'assets');
    try { mkdirSync(assetsDir); } catch(e) {}
    writeFileSync(join(assetsDir, 'calibration-result.json'), json);
    console.log('已保存: assets/calibration-result.json');
}).catch(function(e) {
    console.error('\n失败: ' + e.message);
    process.exit(1);
});
