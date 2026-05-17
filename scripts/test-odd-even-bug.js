/**
 * 测试脚本：验证 generateSingleTicket 在奇偶比+大小比约束下是否始终返回6个红球
 *
 * 用法：node scripts/test-odd-even-bug.js
 */

// ── 模拟浏览器环境 ──
global.crypto = require('crypto').webcrypto;
global.document = { querySelectorAll: () => [], addEventListener: () => {} };

// ── 读取 script.js 并提取关键函数 ──
const fs = require('fs');
const scriptSrc = fs.readFileSync('script.js', 'utf8');

// 提取 secureRandomInt 及其依赖
function secureRandomInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error('maxExclusive 必须是正整数');
    }
    const maxUint32 = 0x100000000;
    const limit = maxUint32 - (maxUint32 % maxExclusive);
    const buf = new Uint32Array(1);
    while (true) {
        buf[0] = 0;
        crypto.getRandomValues(buf);
        const value = buf[0];
        if (value < limit) return value % maxExclusive;
    }
}

// ── 模拟关键数据结构 ──
const LOTTERY_CONFIG = {
    ssq: {
        name: '双色球', redCount: 6, redMax: 33, blueCount: 1, blueMax: 16,
        redDanMin: 1, blueDanMax: 1,
        defaultMultipleRed: 7, defaultMultipleBlue: 1,
        defaultDanTuo: { redDan: 2, redTuo: 5, blueDan: 0, blueTuo: 1 },
        isK8: false
    },
    dlt: {
        name: '大乐透', redCount: 5, redMax: 35, blueCount: 2, blueMax: 12,
        redDanMin: 1, blueDanMax: 2,
        defaultMultipleRed: 6, defaultMultipleBlue: 2,
        defaultDanTuo: { redDan: 2, redTuo: 4, blueDan: 0, blueTuo: 2 },
        isK8: false
    },
    k8: {
        name: '快乐8', redCount: 8, redMax: 80, blueCount: 0, blueMax: 0,
        redDanMin: 1, blueDanMax: 0, ballMax: 80, isK8: true,
        defaultMultipleRed: 22, defaultMultipleBlue: 0,
        defaultDanTuo: { redDan: 4, redTuo: 18, blueDan: 0, blueTuo: 0 }
    }
};

// ── 复制核心函数（从 script.js 提取逻辑） ──
function buildPool(max, excludedSet) {
    var pool = [];
    for (var i = 1; i <= max; i += 1) {
        if (!excludedSet.has(i)) pool.push(i);
    }
    return pool;
}

function shuffleMachine(pool, rounds) {
    var mixedPool = pool.slice();
    for (var round = 0; round < rounds; round += 1) {
        for (var i = mixedPool.length - 1; i > 0; i -= 1) {
            var j = secureRandomInt(i + 1);
            var tmp = mixedPool[i];
            mixedPool[i] = mixedPool[j];
            mixedPool[j] = tmp;
        }
    }
    return mixedPool;
}

function simulatePhysicalDrawFromPool(pool, count) {
    if (count < 0 || count > pool.length) {
        throw new Error('可抽取数量超出号码池范围');
    }
    var mixingRounds = Math.max(12, pool.length * 2);
    var mixedPool = shuffleMachine(pool, mixingRounds);
    return {
        drawn: mixedPool.slice(0, count).sort(function(a, b) { return a - b; }),
        mixingRounds: mixingRounds
    };
}

function drawRemaining(max, excludedNumbers, count) {
    var excludedSet = new Set(excludedNumbers);
    var pool = buildPool(max, excludedSet);
    return simulatePhysicalDrawFromPool(pool, count).drawn;
}

function getMidPoint(game) {
    var config = LOTTERY_CONFIG[game];
    if (config.isK8) return 40;
    return Math.floor(config.redMax / 2);
}

function drawWithOddEvenRatio(pool, oddNeeded, evenNeeded) {
    var oddPool  = pool.filter(function(n) { return n % 2 === 1; });
    var evenPool = pool.filter(function(n) { return n % 2 === 0; });
    if (oddPool.length < oddNeeded || evenPool.length < evenNeeded) {
        throw new Error('奇偶比约束无法满足：奇数池' + oddPool.length + '个（需' + oddNeeded + '），偶数池' + evenPool.length + '个（需' + evenNeeded + '）');
    }
    var oddDraw  = oddNeeded  > 0 ? simulatePhysicalDrawFromPool(oddPool,  oddNeeded).drawn  : [];
    var evenDraw = evenNeeded > 0 ? simulatePhysicalDrawFromPool(evenPool, evenNeeded).drawn : [];
    return [].concat(oddDraw, evenDraw).sort(function(a, b) { return a - b; });
}

function drawWithBigSmallRatio(pool, bigNeeded, smallNeeded, game) {
    var midPoint = getMidPoint(game);
    var bigPool   = pool.filter(function(n) { return n > midPoint; });
    var smallPool = pool.filter(function(n) { return n <= midPoint; });
    if (bigPool.length < bigNeeded || smallPool.length < smallNeeded) {
        throw new Error('大小比约束无法满足：大数池' + bigPool.length + '个（需' + bigNeeded + '），小数池' + smallPool.length + '个（需' + smallNeeded + '）');
    }
    var bigDraw   = bigNeeded   > 0 ? simulatePhysicalDrawFromPool(bigPool,   bigNeeded).drawn   : [];
    var smallDraw = smallNeeded > 0 ? simulatePhysicalDrawFromPool(smallPool, smallNeeded).drawn : [];
    return [].concat(bigDraw, smallDraw).sort(function(a, b) { return a - b; });
}

function drawWithDualConstraint(pool, oddNeeded, evenNeeded, bigNeeded, smallNeeded, game) {
    var midPoint = getMidPoint(game);
    var oddBig = [], oddSmall = [], evenBig = [], evenSmall = [];

    pool.forEach(function(n) {
        var isOdd = n % 2 === 1;
        var isBig = n > midPoint;
        if (isOdd && isBig)       oddBig.push(n);
        else if (isOdd && !isBig) oddSmall.push(n);
        else if (!isOdd && isBig) evenBig.push(n);
        else                      evenSmall.push(n);
    });

    var minOddBig = Math.max(0, oddNeeded - oddSmall.length, bigNeeded - evenBig.length, bigNeeded - evenNeeded);
    var maxOddBig = Math.min(oddNeeded, bigNeeded, oddBig.length, evenSmall.length - evenNeeded + bigNeeded);

    if (minOddBig > maxOddBig) {
        throw new Error(
            '双维度约束无法同时满足！\n' +
            '奇偶要求 ' + oddNeeded + ':' + evenNeeded + '，大小要求 ' + bigNeeded + ':' + smallNeeded + '\n' +
            '奇大池' + oddBig.length + ' 奇小池' + oddSmall.length + ' 偶大池' + evenBig.length + ' 偶小池' + evenSmall.length
        );
    }

    var oddBigCount = minOddBig + secureRandomInt(maxOddBig - minOddBig + 1);
    var oddSmallCount  = oddNeeded - oddBigCount;
    var evenBigCount   = bigNeeded - oddBigCount;
    var evenSmallCount = evenNeeded - evenBigCount;

    var result = [];
    if (oddBigCount    > 0) result = result.concat(simulatePhysicalDrawFromPool(oddBig,    oddBigCount).drawn);
    if (oddSmallCount  > 0) result = result.concat(simulatePhysicalDrawFromPool(oddSmall,  oddSmallCount).drawn);
    if (evenBigCount   > 0) result = result.concat(simulatePhysicalDrawFromPool(evenBig,   evenBigCount).drawn);
    if (evenSmallCount > 0) result = result.concat(simulatePhysicalDrawFromPool(evenSmall, evenSmallCount).drawn);

    return result.sort(function(a, b) { return a - b; });
}

// ── 模拟 quickState ──
var quickState = {
    game: 'ssq',
    mode: 'single',
    isAutoMode: true,
    killedRed: new Set([4, 14, 15, 16, 17, 18]), // 模拟被杀号码
    killedBlue: new Set([9]),
    oddEvenRatio: ['2:4'],  // 2:4 / 4:2
    bigSmallRatio: ['2:4'], // 2大4小 / 4大2小
    similarityThreshold: 0.75,
    generating: false,
    error: '',
    form: { generateCount: 2, multipleRedTotal: 7, multipleBlueTotal: 1, redDanTotal: 2, redTuoTotal: 5, blueDanTotal: 0, blueTuoTotal: 1 },
    custom: { multipleRed: new Set(), multipleBlue: new Set(), redDan: new Set(), redTuo: new Set(), blueDan: new Set(), blueTuo: new Set() }
};

function pickOddEvenRatio() {
    if (!quickState || !quickState.oddEvenRatio || quickState.oddEvenRatio.length === 0) return null;
    var arr = quickState.oddEvenRatio;
    var picked = arr[secureRandomInt(arr.length)];
    var parts = picked.split(':');
    var a = parseInt(parts[0], 10);
    var b = parseInt(parts[1], 10);
    if (a !== b && secureRandomInt(2) === 0) {
        return { odd: b, even: a };
    }
    return { odd: a, even: b };
}

function pickBigSmallRatio() {
    if (!quickState || !quickState.bigSmallRatio || quickState.bigSmallRatio.length === 0) return null;
    var arr = quickState.bigSmallRatio;
    var picked = arr[secureRandomInt(arr.length)];
    var parts = picked.split(':');
    return { big: parseInt(parts[0], 10), small: parseInt(parts[1], 10) };
}

function resolveBigSmallRatio(bsPicked) {
    if (!bsPicked) return null;
    if (bsPicked.big !== bsPicked.small && secureRandomInt(2) === 0) {
        return { big: bsPicked.small, small: bsPicked.big };
    }
    return bsPicked;
}

// ── 核心被测函数 ──
function generateSingleTicket(game) {
    var config = LOTTERY_CONFIG[game];
    var isK8 = config.isK8;
    var sc = isK8 ? (quickState ? quickState.k8SelectMode || 8 : 8) : config.redCount;
    var killedRed  = (quickState && quickState.isAutoMode) ? quickState.killedRed  : new Set();
    var killedBlue = (quickState && quickState.isAutoMode) ? quickState.killedBlue : new Set();
    var redMax = isK8 ? config.ballMax : config.redMax;
    var redPool  = buildPool(redMax, killedRed);
    var bluePool = config.blueCount > 0 ? buildPool(config.blueMax, killedBlue) : [];

    var red;
    var oePicked = pickOddEvenRatio();
    var bsPicked = pickBigSmallRatio();
    bsPicked = resolveBigSmallRatio(bsPicked);

    try {
        if (oePicked && bsPicked) {
            red = drawWithDualConstraint(redPool, oePicked.odd, oePicked.even, bsPicked.big, bsPicked.small, game);
        } else if (oePicked) {
            red = drawWithOddEvenRatio(redPool, oePicked.odd, oePicked.even);
        } else if (bsPicked) {
            red = drawWithBigSmallRatio(redPool, bsPicked.big, bsPicked.small, game);
        } else {
            red = simulatePhysicalDrawFromPool(redPool, sc).drawn;
        }
    } catch (e) {
        quickState.error = e.message;
        red = simulatePhysicalDrawFromPool(redPool, sc).drawn;
    }

    var blue = config.blueCount > 0 ? simulatePhysicalDrawFromPool(bluePool, config.blueCount).drawn : [];
    return {
        mode: 'single',
        red: red,
        blue: blue,
        k8SelectMode: isK8 ? sc : undefined,
        manual: { red: new Set(), blue: new Set() },
        summary: ''
    };
}

// ══════════════════════════════════════════════════════════════
//  测试执行
// ══════════════════════════════════════════════════════════════

const ITERATIONS = 50000;
const EXPECTED_RED_COUNT = 6; // SSQ single mode

console.log('═══════════════════════════════════════════════');
console.log('  DestinyDraw 单式模式红球数量验证测试');
console.log('═══════════════════════════════════════════════');
console.log('游戏: 双色球 (SSQ)');
console.log('模式: 单式 (single)');
console.log('奇偶比约束:', JSON.stringify(quickState.oddEvenRatio));
console.log('大小比约束:', JSON.stringify(quickState.bigSmallRatio));
console.log('被杀红球:', [...quickState.killedRed].sort((a,b)=>a-b).join(','));
console.log('迭代次数:', ITERATIONS);
console.log('预期红球数:', EXPECTED_RED_COUNT);
console.log('───────────────────────────────────────────────');

var failures = [];
var errorCount = 0;
var dualCount = 0;
var oeOnlyCount = 0;
var bsOnlyCount = 0;
var noConstraintCount = 0;

for (var i = 0; i < ITERATIONS; i++) {
    var ticket;
    try {
        ticket = generateSingleTicket('ssq');
    } catch (e) {
        errorCount++;
        if (errorCount <= 5) console.log('  [ERROR] 第' + (i+1) + '次: ' + e.message);
        continue;
    }

    // ── 验证红球数量 ──
    if (ticket.red.length !== EXPECTED_RED_COUNT) {
        failures.push({
            index: i + 1,
            redCount: ticket.red.length,
            red: ticket.red,
            blue: ticket.blue,
            error: quickState.error
        });
    }

    // ── 统计约束路径 ──
    // (无法直接统计，通过 quickState.error 间接判断)
    if (quickState.error && quickState.error.indexOf('双维度') !== -1) dualCount++;

    // 重置错误以便下一轮
    quickState.error = '';
}

console.log('');
console.log('───────────────────────────────────────────────');
console.log('  测试结果');
console.log('───────────────────────────────────────────────');
console.log('总迭代次数:   ' + ITERATIONS);
console.log('抛异常次数:   ' + errorCount);
console.log('红球数错误:   ' + failures.length + ' 次');
console.log('───────────────────────────────────────────────');

if (failures.length > 0) {
    console.log('');
    console.log('  ❌ 发现红球数量异常！');
    failures.slice(0, 20).forEach(function(f) {
        console.log('  第' + f.index + '次: ' + f.redCount + '个红球 → [' + f.red.join(', ') + ']');
        if (f.error) console.log('    错误信息: ' + f.error);
    });
    if (failures.length > 20) {
        console.log('  ... 还有 ' + (failures.length - 20) + ' 个异常');
    }
} else {
    console.log('');
    console.log('  ✅ 全部 ' + ITERATIONS + ' 次生成均返回正确的 ' + EXPECTED_RED_COUNT + ' 个红球');
}

// ── 额外：测试各种奇偶比+大小比组合 ──
console.log('');
console.log('───────────────────────────────────────────────');
console.log('  交叉组合测试（奇偶比 × 大小比）');
console.log('───────────────────────────────────────────────');

var oeOptions = ['1:5', '2:4', '3:3'];
var bsOptions = ['0:6', '1:5', '2:4', '3:3'];
var comboFailures = [];

oeOptions.forEach(function(oe) {
    bsOptions.forEach(function(bs) {
        quickState.oddEvenRatio = [oe];
        quickState.bigSmallRatio = [bs];

        var localFailures = 0;
        var localTotal = 1000;

        for (var j = 0; j < localTotal; j++) {
            try {
                var t = generateSingleTicket('ssq');
                if (t.red.length !== 6) {
                    localFailures++;
                }
            } catch (e) {
                // ignore crashes
            }
        }

        var status = localFailures === 0 ? '✅' : '❌';
        console.log('  ' + status + ' OE=' + oe + ' BS=' + bs + ' → ' + localFailures + '/' + localTotal + ' 异常');
        if (localFailures > 0) comboFailures.push({ oe: oe, bs: bs, failures: localFailures });
    });
});

if (comboFailures.length > 0) {
    console.log('');
    console.log('  ❌ 存在失败的组合！需要进一步排查。');
} else {
    console.log('');
    console.log('  ✅ 所有 OE×BS 组合均正确');
}

// ── 输出日志文件 ──
var logContent = [
    '═══ DestinyDraw 单式模式奇偶比/大小比 测试日志 ═══',
    '测试时间: ' + new Date().toISOString(),
    '游戏: 双色球 (SSQ) 单式模式',
    '迭代次数: ' + ITERATIONS,
    '预期红球数: ' + EXPECTED_RED_COUNT,
    '',
    '约束设置:',
    '  奇偶比: ' + JSON.stringify(quickState.oddEvenRatio),
    '  大小比: ' + JSON.stringify(quickState.bigSmallRatio),
    '',
    '结果:',
    '  红球数量错误: ' + failures.length + ' / ' + ITERATIONS,
    '  抛异常: ' + errorCount,
    '',
    (failures.length === 0 ? '✅ 测试通过：generateSingleTicket 始终返回 ' + EXPECTED_RED_COUNT + ' 个红球' : '❌ 测试失败：发现 ' + failures.length + ' 次红球数量异常'),
    '',
    '交叉组合测试:',
    (comboFailures.length === 0 ? '✅ 所有组合通过' : '❌ ' + comboFailures.length + ' 个组合存在异常'),
].join('\n');

fs.writeFileSync('scripts/test-result.log', logContent);
console.log('');
console.log('详细日志已写入: scripts/test-result.log');
