"use strict";
// 用 Uint8Array 做快速成员判断，避免 Set 或 object 的开销
const MARK33 = new Uint8Array(34);   // 下标 1-33
const MARK16 = new Uint8Array(17);   // 下标 1-16
const TICKET_MARK = new Uint8Array(34); // 用于随机单式每张票的判断

/* 从 1-33 中拒绝采样无放回取 6 个数 */
function p33_6() {
    var d = new Array(6), c = 0, n;
    while (c < 6) {
        n = 1 + ((Math.random() * 33) | 0);
        if (!MARK33[n]) { MARK33[n] = 1; d[c++] = n; }
    }
    for (var i = 0; i < 6; i++) MARK33[d[i]] = 0;
    return d;
}

/* 从 1-max 中取 cnt 个不重复数 */
function pN(max, cnt, mk) {
    var d = new Array(cnt), c = 0, n;
    while (c < cnt) {
        n = 1 + ((Math.random() * max) | 0);
        if (!mk[n]) { mk[n] = 1; d[c++] = n; }
    }
    for (var i = 0; i < cnt; i++) mk[d[i]] = 0;
    return d;
}

/* 检查 winRed（6个）是否全部在 boolArr 中为 1 */
function ai6(w, b) {
    return b[w[0]] && b[w[1]] && b[w[2]] && b[w[3]] && b[w[4]] && b[w[5]];
}

/* ══════════════════════════════════════════════════════════════
   K8 校准专用 —— 模拟抽号与验证
   ══════════════════════════════════════════════════════════════ */
function k8ShuffleMachine(pool, rounds) {
    var mixed = pool.slice();
    for (var r = 0; r < rounds; r++) {
        for (var i = mixed.length - 1; i > 0; i--) {
            var j = (Math.random() * (i + 1)) | 0;
            var tmp = mixed[i]; mixed[i] = mixed[j]; mixed[j] = tmp;
        }
    }
    return mixed;
}

function k8SimulateDraw(count, max) {
    var pool = new Array(max);
    for (var i = 0; i < max; i++) pool[i] = i + 1;
    var mixed = k8ShuffleMachine(pool, Math.max(12, max * 2));
    var drawn = mixed.slice(0, count);
    drawn.sort(function(a, b) { return a - b; });
    return drawn;
}

function k8ValidateRatios(numbers, oeRatios, bsRatios) {
    if (oeRatios && oeRatios.length > 0) {
        var odd = 0, even = 0;
        for (var i = 0; i < numbers.length; i++) {
            if (numbers[i] % 2 === 1) odd++; else even++;
        }
        var match = false;
        for (var o = 0; o < oeRatios.length; o++) {
            var parts = oeRatios[o].split(':');
            var a = parseInt(parts[0], 10), b = parseInt(parts[1], 10);
            if ((odd === a && even === b) || (odd === b && even === a)) { match = true; break; }
        }
        if (!match) return false;
    }
    if (bsRatios && bsRatios.length > 0) {
        var big = 0, small = 0;
        for (var i = 0; i < numbers.length; i++) {
            if (numbers[i] >= 41) big++; else small++;
        }
        var match = false;
        for (var b = 0; b < bsRatios.length; b++) {
            var parts = bsRatios[b].split(':');
            var a = parseInt(parts[0], 10), bv = parseInt(parts[1], 10);
            if ((big === a && small === bv) || (big === bv && small === a)) { match = true; break; }
        }
        if (!match) return false;
    }
    return true;
}

function handleK8Calibrate(cfg) {
    var draws = cfg.draws;
    var oeR = cfg.oddEvenRatios;
    var bsR = cfg.bigSmallRatios;
    var MAX_BETS = 100000;
    var TARGET = 12;
    var results = [];
    var hitCount = 0;

    for (var i = 0; i < draws.length; i++) {
        var draw = draws[i];
        var drawSet = {};
        for (var d = 0; d < draw.red.length; d++) drawSet[draw.red[d]] = true;

        var valid = 0;
        var hitPeriod = null;
        var maxO = 0;

        for (var att = 0; att < MAX_BETS * 2000 && valid < MAX_BETS; att++) {
            var bet = k8SimulateDraw(20, 80);
            if (k8ValidateRatios(bet, oeR, bsR)) {
                valid++;
                var ov = 0;
                for (var b = 0; b < bet.length; b++) { if (drawSet[bet[b]]) ov++; }
                if (ov > maxO) maxO = ov;
                if (ov >= TARGET) { hitPeriod = valid; hitCount++; break; }
            }
        }

        results.push({ code: draw.code, date: draw.date, period: hitPeriod, maxOverlap: maxO });

        if ((i + 1) % 5 === 0 || i === draws.length - 1) {
            self.postMessage({ type: 'k8-progress', processedDraws: i + 1, totalDraws: draws.length, hitCount: hitCount, results: results });
        }
    }

    var hitResults = [];
    for (var ri = 0; ri < results.length; ri++) {
        if (results[ri].period !== null) hitResults.push(results[ri]);
    }
    var averagePeriod = null;
    if (hitResults.length > 0) {
        var sum = 0;
        for (var si = 0; si < hitResults.length; si++) sum += hitResults[si].period;
        averagePeriod = Math.round(sum / hitResults.length);
    }

    self.postMessage({ type: 'k8-done', results: results, averagePeriod: averagePeriod, hitCount: hitCount, totalDraws: draws.length });
}

self.onmessage = function(e) {
    var cfg = e.data;
    if (cfg.type === 'k8-calibrate') {
        handleK8Calibrate(cfg);
        return;
    }
    var cfg = e.data;
    var CHUNK = 200000;  // 每个时间切片处理的期数
    var tot = 0, sec = 0;
    var bt = cfg.betType, pm = cfg.pickMode;

    /* 预计算固定模式的布尔数组 */
    var frb  = new Uint8Array(34);  // fixed single red bool
    var fmr  = new Uint8Array(34);  // fixed multiple red bool
    var fmb  = new Uint8Array(17);  // fixed multiple blue bool
    var rmr  = new Uint8Array(34);  // random multiple red bool（复用）
    var rmb  = new Uint8Array(17);  // random multiple blue bool（复用）
    var danFlag  = new Uint8Array(34);  // 胆拖：胆码
    var tuoFlag  = new Uint8Array(34);  // 胆拖：拖码
    var dtbFlag  = new Uint8Array(17);  // 胆拖：蓝球
    var danArr, danCount;

    if (bt === 'single' && pm === 'fixed') {
        var fa = cfg.fixedRedArr;
        for (var i = 0; i < fa.length; i++) frb[fa[i]] = 1;
    }
    if (bt === 'multiple' && pm === 'fixed') {
        var fra = cfg.fixedMultipleRedArr, fba = cfg.fixedMultipleBlueArr;
        for (var i = 0; i < fra.length; i++) fmr[fra[i]] = 1;
        for (var i = 0; i < fba.length; i++) fmb[fba[i]] = 1;
    }
    if (bt === 'danTuo') {
        danArr = cfg.danRedArr;
        danCount = danArr.length;
        var tArr = cfg.tuoRedArr, bArr = cfg.danTuoBlueArr;
        for (var i = 0; i < danArr.length; i++) danFlag[danArr[i]] = 1;
        for (var i = 0; i < tArr.length; i++) tuoFlag[tArr[i]] = 1;
        for (var i = 0; i < bArr.length; i++) dtbFlag[bArr[i]] = 1;
    }

    var fb  = cfg.fixedBlue;
    var sp  = cfg.singlePerPeriod;
    var mrc = cfg.multipleRedCount;
    var mbc = cfg.multipleBlueCount;
    var gpp = cfg.groupsPerPeriod || 1;

    function runChunk() {
        var won = false;
        for (var iter = 0; iter < CHUNK; iter++) {
            tot++;
            var wr = p33_6();
            var wb = 1 + ((Math.random() * 16) | 0);
            var pr = 0; // 0=没中, 1=一等奖, 2=二等奖

            if (bt === 'single') {
                if (pm === 'fixed') {
                    if (ai6(wr, frb)) pr = (wb === fb) ? 1 : 2;
                } else {
                    /* 随缘瞎买：每期 sp 张随机单式票 */
                    for (var t = 0; t < sp && pr < 1; t++) {
                        var tr = p33_6();
                        var tb = 1 + ((Math.random() * 16) | 0);
                        for (var k = 0; k < 6; k++) TICKET_MARK[tr[k]] = 1;
                        if (ai6(wr, TICKET_MARK)) pr = (tb === wb) ? 1 : 2;
                        for (var k = 0; k < 6; k++) TICKET_MARK[tr[k]] = 0;
                    }
                }
            } else if (bt === 'multiple') {
                /* 复式模式 */
                var rb, bb, rr, bl;
                if (pm === 'fixed') {
                    rb = fmr; bb = fmb;
                    if (ai6(wr, rb)) pr = bb[wb] ? 1 : 2;
                } else {
                    /* 随机复式：每期买 gpp 组，任意一组中奖即算赢 */
                    for (var g = 0; g < gpp && pr < 1; g++) {
                        rr = pN(33, mrc, MARK33);
                        bl = pN(16, mbc, MARK16);
                        for (var k = 0; k < rr.length; k++) rmr[rr[k]] = 1;
                        for (var k = 0; k < bl.length; k++) rmb[bl[k]] = 1;
                        if (ai6(wr, rmr)) pr = rmb[wb] ? 1 : 2;
                        for (var k = 0; k < rr.length; k++) rmr[rr[k]] = 0;
                        for (var k = 0; k < bl.length; k++) rmb[bl[k]] = 0;
                    }
                }
            } else {
                /* 胆拖模式：胆码全在开奖红球里，且开奖红球中剩余的都是拖码 */
                for (var k = 0; k < 6; k++) MARK33[wr[k]] = 1;  // 临时标记开奖红球
                var allDanIn = true;
                for (var k = 0; k < danCount; k++) {
                    if (!MARK33[danArr[k]]) { allDanIn = false; break; }
                }
                if (allDanIn) {
                    var allInDanOrTuo = true;
                    for (var k = 0; k < 6; k++) {
                        if (!danFlag[wr[k]] && !tuoFlag[wr[k]]) { allInDanOrTuo = false; break; }
                    }
                    if (allInDanOrTuo) pr = dtbFlag[wb] ? 1 : 2;
                }
                for (var k = 0; k < 6; k++) MARK33[wr[k]] = 0;  // 重置
            }

            if (pr === 2) sec++;
            if (pr === 1) { won = true; break; }
        }

        if (won || tot >= 500000000) {
            self.postMessage({ type: 'done', totalPeriods: tot, secondPrizes: sec, capped: tot >= 500000000 && !won });
        } else {
            self.postMessage({ type: 'progress', totalPeriods: tot });
            setTimeout(runChunk, 0);
        }
    }

    runChunk();
};
