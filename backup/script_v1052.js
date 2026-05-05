const LOTTERY_CONFIG = {
    ssq: {
        name: '双色球',
        redCount: 6,
        redMax: 33,
        blueCount: 1,
        blueMax: 16,
        redDanMin: 1,
        blueDanMax: 1,
        defaultMultipleRed: 7,
        defaultMultipleBlue: 1,
        defaultDanTuo: {
            redDan: 2,
            redTuo: 5,
            blueDan: 0,
            blueTuo: 1
        }
    },
    dlt: {
        name: '大乐透',
        redCount: 5,
        redMax: 35,
        blueCount: 2,
        blueMax: 12,
        redDanMin: 1,
        blueDanMax: 1,
        defaultMultipleRed: 8,
        defaultMultipleBlue: 3,
        defaultDanTuo: {
            redDan: 2,
            redTuo: 4,
            blueDan: 1,
            blueTuo: 1
        }
    },
    k8: {
        name: '快乐8',
        isK8: true,
        ballMax: 80,
        drawCount: 20,
        /* 以下字段随 k8SelectMode 动态覆盖，此处给默认值（选八） */
        redCount: 8,
        redMax: 80,
        blueCount: 0,
        blueMax: 0,
        redDanMin: 1,
        blueDanMax: 0,
        defaultMultipleRed: 9,
        defaultMultipleBlue: 0,
        defaultDanTuo: { redDan: 2, redTuo: 7, blueDan: 0, blueTuo: 0 }
    }
};

const SUBPAGES = {
    'ssq-auto': {
        title: '双色球自动选号',
        desc: '自动生成 4 组参考号，以第 4 组红球为杀号，从剩余球池中按单式、复式或胆拖生成最终选号。',
        game: 'ssq'
    },
    'dlt-auto': {
        title: '大乐透自助选号',
        desc: '自动生成 4 组参考号，以第 4 组红球与蓝球为杀号，从剩余球池中按单式、复式或胆拖生成最终选号。',
        game: 'dlt'
    },
    'ssq-miss': {
        title: '错过100万了吗',
        desc: '输入你的号码（单式/复式/胆拖），对比最近100期真实开奖，看看曾经错过哪些奖。',
        game: null
    },
    'dlt-when': {
        title: '这辈子能中500万吗？',
        desc: '彩票人生模拟器，什么时候能中一等奖到底是逆天改命，还是一穷到底',
        game: 'ssq'
    },
    'ssq-quick': {
        title: '机选双色球',
        desc: '支持单式、复式、胆拖，并支持一部分自选、一部分随机。',
        game: 'ssq'
    },
    'dlt-quick': {
        title: '机选大乐透',
        desc: '支持单式、复式、胆拖，并支持一部分自选、一部分随机。',
        game: 'dlt'
    },
    'k8-auto': {
        title: '快乐8自动选号',
        desc: '生成4组参考号模拟快乐8摇奖，以第4组为杀号组，从剩余球池按选一到选十的玩法生成最终号码。',
        game: 'k8'
    },
    'k8-quick': {
        title: '机选快乐8',
        desc: '支持选一到选十全玩法，可单式、复式或胆拖（选二及以上），并支持一部分自选、一部分随机。',
        game: 'k8'
    },
    'validator': {
        title: '历史验证器',
        desc: '输入一注号码，与双色球/大乐透/快乐8历史开奖对比，统计平均命中与全空轮次。',
        game: null
    },
    'validation-log': {
        title: '空号校验工具',
        desc: '手动选号进行一次性历史比对，查看历史校验结果、AI参数建议与回滚操作。',
        game: null
    }
};

const QUICK_PAGE_KEYS    = new Set(['ssq-quick', 'dlt-quick', 'k8-quick']);
const AUTO_PAGE_KEYS     = new Set(['ssq-auto',  'dlt-auto',  'k8-auto']);
const LIFE_SIM_PAGE_KEYS = new Set(['dlt-when']);
const MISS_PAGE_KEYS     = new Set(['ssq-miss']);
const VALIDATOR_PAGE_KEYS = new Set(['validator']);
const VLOG_PAGE_KEYS      = new Set(['validation-log']);

/* ══════════════════════════════════════════════════════════════
   LotteryDB —— 历史开奖号码共享数据库
   · 页面加载后自动后台拉取：SSQ ~500期 / DLT ~300期（3页合并）
   · 持久化到 localStorage（24h 有效），全局单例
   API:
     LotteryDB.getDraws('ssq'|'dlt')  → draws[] 同步读取
     LotteryDB.getMeta('ssq')         → { count, updatedAt, loading, error }
     LotteryDB.on(fn)                 → 订阅数据更新
     LotteryDB.refresh('ssq')         → 强制刷新，返回 Promise
   ══════════════════════════════════════════════════════════════ */
const LotteryDB = (() => {
    const DB_KEY     = { ssq: 'lotterydb_v1_ssq', dlt: 'lotterydb_v1_dlt', k8: 'lotterydb_v1_k8' };
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    const SSQ_URL    = 'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=500';
    const K8_URL     = 'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8&issueCount=300';
    const DLT_URL    = p => `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.do?gameNo=85&provinceId=0&pageSize=100&isVerify=1&pageNo=${p}`;
    const PROXIES    = [
        url => 'https://corsproxy.io/?url=' + encodeURIComponent(url),
        url => 'https://api.allorigins.win/get?url=' + encodeURIComponent(url)
    ];
    let _mem       = { ssq: null, dlt: null, k8: null };
    let _busy      = { ssq: false, dlt: false, k8: false };
    let _listeners = [];

    async function _fetchJson(url) {
        const tries = [
            () => fetch(url, { mode: 'cors' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
            () => fetch(PROXIES[0](url)).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
            () => fetch(PROXIES[1](url)).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json().then(w => JSON.parse(w.contents)); })
        ];
        let last;
        for (const fn of tries) { try { return await fn(); } catch (e) { last = e; } }
        throw last || new Error('请求失败');
    }
    function _parseSsq(j) {
        return (j.result || []).map(x => ({
            code: String(x.code), date: x.date,
            red: x.red.split(',').map(Number), blue: [Number(x.blue)]
        }));
    }
    function _parseDlt(j) {
        return ((j.value && j.value.list) || []).map(x => {
            const p = x.lotteryDrawResult.trim().split(/\s+/).map(Number);
            return { code: String(x.lotteryDrawNum), date: x.lotteryDrawTime,
                red: p.slice(0, 5), blue: p.slice(5) };
        });
    }
    function _parseK8(j) {
        return (j.result || []).map(x => ({
            code: String(x.code), date: x.date,
            red: String(x.red).split(',').map(Number)
        }));
    }
    function _load(g) {
        try { const r = localStorage.getItem(DB_KEY[g]); return r ? JSON.parse(r) : null; }
        catch (_) { return null; }
    }
    function _save(g, s) { try { localStorage.setItem(DB_KEY[g], JSON.stringify(s)); } catch (_) {} }
    function _notify(g) { _listeners.forEach(fn => { try { fn(g); } catch (_) {} }); }

    async function _doRefresh(game) {
        if (_busy[game]) return;
        _busy[game] = true;
        const prev = _mem[game];
        _mem[game] = { draws: prev ? prev.draws : [], updatedAt: prev ? prev.updatedAt : null,
            loading: true, error: null };
        _notify(game);
        try {
            // 1. 优先读本地数据文件（GitHub Actions 每日更新，无 CORS 问题）
            try {
                const localRes = await fetch('./data/' + game + '.json');
                if (localRes.ok) {
                    const store = await localRes.json();
                    if (Array.isArray(store.draws) && store.draws.length > 0) {
                        _mem[game] = { ...store, loading: false, error: null };
                        _save(game, store);
                        return;
                    }
                }
            } catch (_) { /* 本地文件不存在，回退到 API */ }
            // 2. 回退：远程 API + CORS 代理
            let draws;
            if (game === 'ssq') {
                draws = _parseSsq(await _fetchJson(SSQ_URL));
            } else if (game === 'k8') {
                draws = _parseK8(await _fetchJson(K8_URL));
            } else {
                const seen = new Set();
                const pages = await Promise.all([1, 2, 3].map(p => _fetchJson(DLT_URL(p))));
                draws = pages.flatMap(_parseDlt)
                    .filter(d => seen.has(d.code) ? false : (seen.add(d.code), true));
            }
            const store = { draws, updatedAt: Date.now() };
            _mem[game] = { ...store, loading: false, error: null };
            _save(game, store);
        } catch (err) {
            _mem[game] = { draws: prev ? prev.draws : [], updatedAt: prev ? prev.updatedAt : null,
                loading: false, error: err.message || '获取失败' };
        } finally {
            _busy[game] = false;
            _notify(game);
        }
    }

    return {
        getDraws(g) { return _mem[g] ? _mem[g].draws : []; },
        getMeta(g) {
            const m = _mem[g];
            if (!m) return { count: 0, updatedAt: null, loading: false, error: null };
            return { count: m.draws.length, updatedAt: m.updatedAt, loading: m.loading, error: m.error };
        },
        on(fn)     { _listeners.push(fn); },
        refresh(g) { return _doRefresh(g); },
        init() {
            ['ssq', 'dlt', 'k8'].forEach((g, i) => {
                const s = _load(g);
                if (s && Array.isArray(s.draws) && s.draws.length > 0) {
                    _mem[g] = { ...s, loading: false, error: null };
                }
                const age = s ? Date.now() - s.updatedAt : Infinity;
                if (age > MAX_AGE_MS) {
                    setTimeout(() => _doRefresh(g), i === 0 ? 800 : i === 1 ? 2500 : 4200);
                }
            });
        }
    };
})();

/* 组合数 C(n, k) */
function combination(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 0; i < k; i++) {
        result = Math.round(result * (n - i) / (i + 1));
    }
    return result;
}

/* 根据当前配置计算总注数 */
function calculateTicketCount(game, mode, form) {
    const config = LOTTERY_CONFIG[game];
    if (mode === 'single') return form.generateCount;
    // k8 无蓝球，复式/胆拖只用一个球池
    if (config.isK8) {
        const sc = form._k8SelectMode || config.redCount; // 当前选法
        if (mode === 'multiple') {
            return form.generateCount * combination(form.multipleRedTotal, sc);
        }
        if (mode === 'dantuo') {
            return form.generateCount * combination(form.redTuoTotal, sc - form.redDanTotal);
        }
        return 0;
    }
    if (mode === 'multiple') {
        const perGroup = game === 'ssq'
            ? combination(form.multipleRedTotal, config.redCount) * form.multipleBlueTotal
            : combination(form.multipleRedTotal, config.redCount) * combination(form.multipleBlueTotal, config.blueCount);
        return form.generateCount * perGroup;
    }
    if (mode === 'dantuo') {
        const redCombos  = combination(form.redTuoTotal, config.redCount - form.redDanTotal);
        const blueNeeded = config.blueCount - form.blueDanTotal;
        const blueCombos = blueNeeded <= 0 ? 1 : combination(form.blueTuoTotal, Math.max(0, blueNeeded));
        return form.generateCount * redCombos * Math.max(1, blueCombos);
    }
    return 0;
}

/* 格式化号码数组：每个号码两位，空格分隔 */
function formatNums(numbers) {
    return numbers.map(n => String(n).padStart(2, '0')).join(' ');
}

const AUTO_GROUP_MIN_DELAY_MS = 140;
const AUTO_GROUP_DELAY_JITTER_MS = 40;
const AUTO_SIMILARITY_RETRY_LIMIT = 6;

// 预分配单个 buffer，避免 secureRandomInt 每次调用都分配新对象
const _secureRngBuffer = new Uint32Array(1);


const subpageView = document.getElementById('subpageView');
const backHomeBtn = document.getElementById('backHomeBtn');
const subpageTitle = document.getElementById('subpageTitle');
const subpageDesc = document.getElementById('subpageDesc');
const modelNoteText = document.getElementById('modelNoteText');
const subpageContent = document.getElementById('subpageContent');
const navCards = Array.from(document.querySelectorAll('.nav-card'));

let activePageKey = null;
let quickState = null;
let missState = null;

function secureRandomInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error('maxExclusive 必须是正整数');
    }

    const maxUint32 = 0x100000000;
    const limit = maxUint32 - (maxUint32 % maxExclusive);

    while (true) {
        _secureRngBuffer[0] = 0;
        crypto.getRandomValues(_secureRngBuffer);
        const value = _secureRngBuffer[0];
        if (value < limit) return value % maxExclusive;
    }
}

function formatNumber(number) {
    return String(number).padStart(2, '0');
}

function createBallElement(number, color, isManual) {
    const span = document.createElement('span');
    span.className = `mini-ball ${color}${isManual ? ' manual' : ''}`;
    span.textContent = formatNumber(number);
    return span;
}

function sortAsc(numbers) {
    return [...numbers].sort((a, b) => a - b);
}

function buildPool(max, excludedSet) {
    const pool = [];
    for (let i = 1; i <= max; i += 1) {
        if (!excludedSet.has(i)) pool.push(i);
    }
    return pool;
}

function shuffleMachine(pool, rounds) {
    const mixedPool = [...pool];
    for (let round = 0; round < rounds; round += 1) {
        for (let i = mixedPool.length - 1; i > 0; i -= 1) {
            const j = secureRandomInt(i + 1);
            [mixedPool[i], mixedPool[j]] = [mixedPool[j], mixedPool[i]];
        }
    }
    return mixedPool;
}

function simulatePhysicalDrawFromPool(pool, count) {
    if (count < 0 || count > pool.length) {
        throw new Error('可抽取数量超出号码池范围');
    }

    const mixingRounds = Math.max(12, pool.length * 2);
    const mixedPool = shuffleMachine(pool, mixingRounds);
    return {
        drawn: mixedPool.slice(0, count).sort((a, b) => a - b),
        mixingRounds
    };
}

function simulatePhysicalDraw(count, max) {
    return simulatePhysicalDrawFromPool(Array.from({ length: max }, (_, index) => index + 1), count);
}

function generateLotteryByMachine(game) {
    const config = LOTTERY_CONFIG[game];
    const redResult = simulatePhysicalDraw(config.redCount, config.redMax);
    const blueResult = simulatePhysicalDraw(config.blueCount, config.blueMax);

    return {
        red: redResult.drawn,
        blue: blueResult.drawn,
        machineMeta: {
            redRounds: redResult.mixingRounds,
            blueRounds: blueResult.mixingRounds
        }
    };
}

function drawRemaining(max, excludedNumbers, count) {
    const excludedSet = new Set(excludedNumbers);
    const pool = buildPool(max, excludedSet);
    return simulatePhysicalDrawFromPool(pool, count).drawn;
}

function renderBallRow(numbers, color, manualSet) {
    const row = document.createElement('div');
    row.className = 'ball-row';
    numbers.forEach(number => {
        row.appendChild(createBallElement(number, color, manualSet && manualSet.has(number)));
    });
    return row;
}

function getModelDescription() {
    return '统一采用“完整球池 + 多轮随机洗牌 + 顺序出球”的虚拟摇奖机模型。真实双色球、超级大乐透这类摇奖，本质上是把编号实体球放进球仓，通过空气搅拌或机械混合后随机滚出中选球。对网页程序来说，最接近这种物理过程、同时又保持均匀性的做法，不是直接在范围里反复取随机数，而是先构建全部球，再反复洗牌模拟混合，最后按出球顺序取前几枚。';
}

function createEmptyQuickCustomState() {
    return {
        multipleRed: new Set(),
        multipleBlue: new Set(),
        redDan: new Set(),
        redTuo: new Set(),
        blueDan: new Set(),
        blueTuo: new Set()
    };
}

function createQuickState(game, pageKey) {
    const config = LOTTERY_CONFIG[game];
    const state = {
        pageKey,
        game,
        mode: 'single',
        form: {
            generateCount: 2,
            multipleRedTotal: config.defaultMultipleRed,
            multipleBlueTotal: config.defaultMultipleBlue,
            redDanTotal: config.defaultDanTuo.redDan,
            redTuoTotal: config.defaultDanTuo.redTuo,
            blueDanTotal: config.defaultDanTuo.blueDan,
            blueTuoTotal: config.defaultDanTuo.blueTuo
        },
        custom: createEmptyQuickCustomState(),
        generating: false,
        results: [],
        error: ''
    };
    if (config.isK8) state.k8SelectMode = 8; // 默认选八
    return state;
}

function createAutoState(game, pageKey) {
    const config = LOTTERY_CONFIG[game];
    const state = {
        pageKey,
        game,
        isAutoMode: true,
        step: 'start', // 'start' | 'kill' | 'configure'
        killGroups: [],
        killedRed:  new Set(),
        killedBlue: new Set(),
        k8GroupsExpanded: false,
        mode: 'single',
        form: {
            generateCount: 2,
            multipleRedTotal: config.defaultMultipleRed,
            multipleBlueTotal: config.defaultMultipleBlue,
            redDanTotal: config.defaultDanTuo.redDan,
            redTuoTotal: config.defaultDanTuo.redTuo,
            blueDanTotal: config.defaultDanTuo.blueDan,
            blueTuoTotal: config.defaultDanTuo.blueTuo
        },
        custom: createEmptyQuickCustomState(),
        generating: false,
        results: [],
        error: ''
    };
    if (config.isK8) state.k8SelectMode = 8; // 默认选八
    return state;
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

function getTicketNumberSets(ticket) {
    if (!ticket) return { red: new Set(), blue: new Set() };

    if (ticket.mode === 'dantuo') {
        return {
            red: new Set([...(ticket.redDan || []), ...(ticket.redTuo || [])]),
            blue: new Set([...(ticket.blueDan || []), ...(ticket.blueTuo || [])])
        };
    }

    return {
        red: new Set(ticket.red || []),
        blue: new Set(ticket.blue || [])
    };
}

function calcSetOverlapRatio(setA, setB) {
    const base = Math.max(1, Math.min(setA.size, setB.size));
    let overlap = 0;
    setA.forEach(value => {
        if (setB.has(value)) overlap += 1;
    });
    return overlap / base;
}

function calcTicketSimilarity(candidate, baseline) {
    const c = getTicketNumberSets(candidate);
    const b = getTicketNumberSets(baseline);
    const redRatio = calcSetOverlapRatio(c.red, b.red);
    // 无蓝球时（如快乐8）不参与蓝球权重，否则相似度最高0.72，
    // 造成 score < 0.75 永远成立、差异化重试完全失效
    if (b.blue.size === 0 && c.blue.size === 0) return redRatio;
    const blueRatio = calcSetOverlapRatio(c.blue, b.blue);
    // 红球对可读感知影响更大，权重略高。
    return (redRatio * 0.72) + (blueRatio * 0.28);
}

function createTicketByMode(game, mode) {
    if (mode === 'single') return generateSingleTicket(game);
    if (mode === 'multiple') return generateMultipleTicket(game);
    return generateDanTuoTicket(game);
}

function createAutoDiverseTicket(game, mode, previousResults) {
    if (!previousResults.length) {
        return createTicketByMode(game, mode);
    }

    let bestTicket = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const baseline = previousResults[previousResults.length - 1];

    for (let attempt = 0; attempt < AUTO_SIMILARITY_RETRY_LIMIT; attempt += 1) {
        const candidate = createTicketByMode(game, mode);
        const score = calcTicketSimilarity(candidate, baseline);
        if (score < bestScore) {
            bestScore = score;
            bestTicket = candidate;
        }
        if (score < 0.75) {
            return candidate;
        }
    }

    return bestTicket || createTicketByMode(game, mode);
}

async function waitForNextAutoGroup() {
    const jitter = secureRandomInt(AUTO_GROUP_DELAY_JITTER_MS + 1);
    await sleep(AUTO_GROUP_MIN_DELAY_MS + jitter);
}

function getQuickPickerLimit(group) {
    if (!quickState) return 0;
    const form = quickState.form;
    switch (group) {
        case 'multipleRed':
            return form.multipleRedTotal;
        case 'multipleBlue':
            return form.multipleBlueTotal;
        case 'redDan':
            return form.redDanTotal;
        case 'redTuo':
            return form.redTuoTotal;
        case 'blueDan':
            return form.blueDanTotal;
        case 'blueTuo':
            return form.blueTuoTotal;
        default:
            return 0;
    }
}

function trimSetToLimit(sourceSet, limit) {
    const trimmed = sortAsc([...sourceSet]).slice(0, Math.max(0, limit));
    return new Set(trimmed);
}

function normalizeQuickSelections() {
    if (!quickState) return;
    const config = LOTTERY_CONFIG[quickState.game];
    const form = quickState.form;
    const custom = quickState.custom;

    custom.multipleRed = trimSetToLimit(new Set([...custom.multipleRed].filter(n => n >= 1 && n <= config.redMax)), form.multipleRedTotal);
    custom.multipleBlue = trimSetToLimit(new Set([...custom.multipleBlue].filter(n => n >= 1 && n <= config.blueMax)), form.multipleBlueTotal);

    custom.redDan = trimSetToLimit(new Set([...custom.redDan].filter(n => n >= 1 && n <= config.redMax)), form.redDanTotal);
    custom.redTuo = trimSetToLimit(new Set([...custom.redTuo].filter(n => n >= 1 && n <= config.redMax && !custom.redDan.has(n))), form.redTuoTotal);
    custom.redDan = new Set([...custom.redDan].filter(n => !custom.redTuo.has(n)));

    custom.blueDan = trimSetToLimit(new Set([...custom.blueDan].filter(n => n >= 1 && n <= config.blueMax)), form.blueDanTotal);
    custom.blueTuo = trimSetToLimit(new Set([...custom.blueTuo].filter(n => n >= 1 && n <= config.blueMax && !custom.blueDan.has(n))), form.blueTuoTotal);
    custom.blueDan = new Set([...custom.blueDan].filter(n => !custom.blueTuo.has(n)));
}

function renderPlaceholderContent(pageKey) {
    const page = SUBPAGES[pageKey];
    const fragment = document.createDocumentFragment();

    const note = document.createElement('div');
    note.className = 'preview-card';
    note.innerHTML = '<h3 class="preview-title">当前阶段</h3><p class="preview-text">这里只先固定二级界面容器，避免不同功能继续堆在首页产生相互污染。下一步再分别补每个按钮自己的内容。</p>';
    fragment.appendChild(note);

    const preview = generateLotteryByMachine(page.game);
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-card';
    wrapper.innerHTML = `<h3 class="preview-title">统一摇奖机模型示例</h3><p class="preview-text">当前示例先用完整球池、多轮洗牌、顺序出球的方式模拟 ${LOTTERY_CONFIG[page.game].name} 摇奖。</p>`;
    wrapper.appendChild(renderBallRow(preview.red, 'red'));
    wrapper.appendChild(renderBallRow(preview.blue, 'blue'));
    fragment.appendChild(wrapper);

    return fragment;
}

function renderQuickPicker(title, group, color, max, selectedSet, limit, excludedSet) {
    const card = document.createElement('div');
    card.className = 'picker-card';

    const header = document.createElement('div');
    header.className = 'picker-header';
    header.innerHTML = `<h4>${title}</h4><span>已自选 ${selectedSet.size} / ${limit}</span>`;
    card.appendChild(header);

    const tip = document.createElement('p');
    tip.className = 'picker-tip';
    tip.textContent = limit === 0 ? '当前这一栏数量为 0，将全部交给随机填充。' : '可以只选一部分，剩余数量将按摇奖机模型随机补齐。';
    card.appendChild(tip);

    const grid = document.createElement('div');
    grid.className = 'number-grid';

    for (let i = 1; i <= max; i += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `pick-chip ${color}`;
        button.dataset.pickGroup = group;
        button.dataset.number = String(i);
        button.textContent = formatNumber(i);

        if (selectedSet.has(i)) button.classList.add('active');
        if (!selectedSet.has(i) && excludedSet && excludedSet.has(i)) {
            button.disabled = true;
            button.classList.add('blocked');
        }

        grid.appendChild(button);
    }

    card.appendChild(grid);
    return card;
}

function renderQuickResults(results) {
    const container = document.createElement('div');
    container.className = 'results-grid';

    if (!results.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = '先配置模式和选号方式，再点击“开始生成”。';
        container.appendChild(empty);
        return container;
    }

    results.forEach((ticket, index) => {
        const card = document.createElement('article');
        card.className = 'ticket-card';

        const title = document.createElement('h4');
        title.className = 'ticket-title';
        title.textContent = `第 ${index + 1} 组`;
        card.appendChild(title);

        if (ticket.mode === 'dantuo') {
            const redDanLabel = document.createElement('p');
            redDanLabel.className = 'ticket-label';
            redDanLabel.textContent = '红球胆码';
            card.appendChild(redDanLabel);
            card.appendChild(renderBallRow(ticket.redDan, 'red', ticket.manual.redDan));

            const redTuoLabel = document.createElement('p');
            redTuoLabel.className = 'ticket-label';
            redTuoLabel.textContent = '红球拖码';
            card.appendChild(redTuoLabel);
            card.appendChild(renderBallRow(ticket.redTuo, 'red', ticket.manual.redTuo));

            const blueDanLabel = document.createElement('p');
            blueDanLabel.className = 'ticket-label';
            blueDanLabel.textContent = '蓝球胆码';
            card.appendChild(blueDanLabel);
            card.appendChild(renderBallRow(ticket.blueDan, 'blue', ticket.manual.blueDan));

            const blueTuoLabel = document.createElement('p');
            blueTuoLabel.className = 'ticket-label';
            blueTuoLabel.textContent = '蓝球拖码';
            card.appendChild(blueTuoLabel);
            card.appendChild(renderBallRow(ticket.blueTuo, 'blue', ticket.manual.blueTuo));
        } else {
            const redLabel = document.createElement('p');
            redLabel.className = 'ticket-label';
            redLabel.textContent = '红球';
            card.appendChild(redLabel);
            card.appendChild(renderBallRow(ticket.red, 'red', ticket.manual.red));

            const blueLabel = document.createElement('p');
            blueLabel.className = 'ticket-label';
            blueLabel.textContent = '蓝球';
            card.appendChild(blueLabel);
            card.appendChild(renderBallRow(ticket.blue, 'blue', ticket.manual.blue));
        }

        const note = document.createElement('p');
        note.className = 'ticket-note';
        note.textContent = ticket.summary;
        card.appendChild(note);

        container.appendChild(card);
    });

    return container;
}

/* ── 小票风格结果渲染（统一用于机选和自动选号页面）── */
function renderReceiptResults(results, game, mode, form) {
    const config = LOTTERY_CONFIG[game];

    if (!results.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = '先配置模式和选号方式，再点击「开始生成」。';
        return empty;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'slip-wrapper';

    // 标题行
    const titleRow = document.createElement('div');
    titleRow.className = 'slip-header';
    const modeLabel = mode === 'single' ? '单式' : mode === 'multiple' ? '复式' : '胆拖';
    titleRow.innerHTML = `<span class="slip-title">选号单</span><span class="slip-meta">${config.name} · ${modeLabel}</span>`;
    wrapper.appendChild(titleRow);

    // 各组列表
    const list = document.createElement('div');
    list.className = 'slip-list';
    results.forEach((ticket, idx) => {
        const row = document.createElement('div');
        row.className = 'slip-row';

        const label = document.createElement('span');
        label.className = 'slip-row-label';
        label.textContent = `第 ${idx + 1} 组`;
        row.appendChild(label);

        const balls = document.createElement('span');
        balls.className = 'slip-row-balls';
        if (ticket.mode === 'dantuo') {
            if (config.isK8) {
                balls.textContent = `胆 ${formatNums(ticket.redDan)}  拖 ${formatNums(ticket.redTuo)}`;
            } else {
                const bluePart = ticket.blueDan.length
                    ? `  蓝胆 ${formatNums(ticket.blueDan)}  蓝拖 ${formatNums(ticket.blueTuo)}`
                    : (ticket.blueTuo.length ? `  蓝 ${formatNums(ticket.blueTuo)}` : '');
                balls.textContent = `红胆 ${formatNums(ticket.redDan)}  红拖 ${formatNums(ticket.redTuo)}${bluePart}`;
            }
        } else if (config.isK8) {
            balls.textContent = `选号 ${formatNums(ticket.red)}`;
        } else {
            balls.textContent = `红球 ${formatNums(ticket.red)}   蓝球 ${formatNums(ticket.blue)}`;
        }
        row.appendChild(balls);
        list.appendChild(row);
    });

    // 杀号组行（自动选号模式）
    let killGroupEntry = null;
    if (quickState && quickState.isAutoMode && quickState.killGroups && quickState.killGroups.length > 0) {
        killGroupEntry = quickState.killGroups[quickState.killGroups.length - 1];
        const kRow = document.createElement('div');
        kRow.className = 'slip-row slip-row-kill';
        const kLabel = document.createElement('span');
        kLabel.className = 'slip-row-label';
        kLabel.textContent = '杀号组';
        kRow.appendChild(kLabel);
        const kBalls = document.createElement('span');
        kBalls.className = 'slip-row-balls';
        kBalls.textContent = `红球 ${formatNums(killGroupEntry.red)}   蓝球 ${formatNums(killGroupEntry.blue)}`;
        kRow.appendChild(kBalls);
        list.appendChild(kRow);
    }
    wrapper.appendChild(list);

    // 费用合计
    const totalTickets = calculateTicketCount(game, mode, form);
    const killNotes    = killGroupEntry ? 1 : 0;
    const allTickets   = totalTickets + killNotes;
    const totalCost    = allTickets * 2;
    const footer = document.createElement('div');
    footer.className = 'slip-footer';
    footer.innerHTML = `<span>共 <strong>${results.length + killNotes}</strong> 组 · <strong>${allTickets}</strong> 注</span><span class="slip-cost">¥ ${totalCost.toFixed(2)}</span>`;
    wrapper.appendChild(footer);

    // 一键复制按钮
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'slip-copy-btn';
    copyBtn.textContent = '一键复制';
    copyBtn.addEventListener('click', () => {
        const lines = results.map((ticket, idx) => {
            if (ticket.mode === 'dantuo') {
                const bluePart = ticket.blueDan.length
                    ? `  蓝胆 ${formatNums(ticket.blueDan)}  蓝拖 ${formatNums(ticket.blueTuo)}`
                    : (ticket.blueTuo.length ? `  蓝 ${formatNums(ticket.blueTuo)}` : '');
                return `第${idx + 1}组：红胆 ${formatNums(ticket.redDan)}  红拖 ${formatNums(ticket.redTuo)}${bluePart}`;
            }
            return `第${idx + 1}组：红球 ${formatNums(ticket.red)}  蓝球 ${formatNums(ticket.blue)}`;
        });
        if (killGroupEntry) {
            lines.push(`杀号组：红球 ${formatNums(killGroupEntry.red)}  蓝球 ${formatNums(killGroupEntry.blue)}`);
        }
        lines.push(`共${results.length + killNotes}组 ${allTickets}注 ¥${totalCost.toFixed(2)}`);
        navigator.clipboard.writeText(lines.join('\n')).then(() => {
            copyBtn.textContent = '已复制 ✓';
            setTimeout(() => { copyBtn.textContent = '一键复制'; }, 2000);
        }).catch(() => {
            copyBtn.textContent = '复制失败';
            setTimeout(() => { copyBtn.textContent = '一键复制'; }, 2000);
        });
    });
    wrapper.appendChild(copyBtn);

    return wrapper;
}

function renderSingleModePanel() {
    const wrapper = document.createElement('div');
    wrapper.className = 'config-card';
    wrapper.innerHTML = `
        <div class="form-grid">
            <label class="field-block">
                <span class="field-label">生成组数</span>
                <input class="field-input" data-field="generateCount" type="number" min="1" max="50" value="${quickState.form.generateCount}">
            </label>
        </div>
        <p class="helper-text">单式只决定生成多少组，每组都会按标准规则完整机选。</p>
    `;
    return wrapper;
}

function renderMultipleModePanel() {
    const config = LOTTERY_CONFIG[quickState.game];
    const wrapper = document.createElement('div');
    wrapper.className = 'config-stack';

    const formCard = document.createElement('div');
    formCard.className = 'config-card';
    formCard.innerHTML = `
        <div class="form-grid">
            <label class="field-block">
                <span class="field-label">生成组数</span>
                <input class="field-input" data-field="generateCount" type="number" min="1" max="50" value="${quickState.form.generateCount}">
            </label>
            <label class="field-block">
                <span class="field-label">红球总数</span>
                <input class="field-input" data-field="multipleRedTotal" type="number" min="${config.redCount}" max="${config.redMax}" value="${quickState.form.multipleRedTotal}">
            </label>
            <label class="field-block">
                <span class="field-label">蓝球总数</span>
                <input class="field-input" data-field="multipleBlueTotal" type="number" min="${config.blueCount}" max="${config.blueMax}" value="${quickState.form.multipleBlueTotal}">
            </label>
        </div>
        <p class="helper-text">可以只自选其中一部分号码，例如 9+1 里自选 3 个红球，剩余数量由统一摇奖机模型随机补齐。</p>
    `;
    wrapper.appendChild(formCard);

    const exRed  = (quickState && quickState.isAutoMode) ? quickState.killedRed  : new Set();
    const exBlue = (quickState && quickState.isAutoMode) ? quickState.killedBlue : new Set();
    wrapper.appendChild(renderQuickPicker('自选红球', 'multipleRed', 'red', config.redMax, quickState.custom.multipleRed, quickState.form.multipleRedTotal, exRed));
    wrapper.appendChild(renderQuickPicker('自选蓝球', 'multipleBlue', 'blue', config.blueMax, quickState.custom.multipleBlue, quickState.form.multipleBlueTotal, exBlue));

    return wrapper;
}

function renderDantuoModePanel() {
    const config = LOTTERY_CONFIG[quickState.game];
    const wrapper = document.createElement('div');
    wrapper.className = 'config-stack';

    const formCard = document.createElement('div');
    formCard.className = 'config-card';
    formCard.innerHTML = `
        <div class="form-grid four-col">
            <label class="field-block">
                <span class="field-label">生成组数</span>
                <input class="field-input" data-field="generateCount" type="number" min="1" max="50" value="${quickState.form.generateCount}">
            </label>
            <label class="field-block">
                <span class="field-label">红球胆码总数</span>
                <input class="field-input" data-field="redDanTotal" type="number" min="${config.redDanMin}" max="${config.redCount - 1}" value="${quickState.form.redDanTotal}">
            </label>
            <label class="field-block">
                <span class="field-label">红球拖码总数</span>
                <input class="field-input" data-field="redTuoTotal" type="number" min="1" max="${config.redMax}" value="${quickState.form.redTuoTotal}">
            </label>
            <label class="field-block">
                <span class="field-label">蓝球胆码总数</span>
                <input class="field-input" data-field="blueDanTotal" type="number" min="0" max="${config.blueDanMax}" value="${quickState.form.blueDanTotal}">
            </label>
            <label class="field-block">
                <span class="field-label">蓝球拖码总数</span>
                <input class="field-input" data-field="blueTuoTotal" type="number" min="0" max="${config.blueMax}" value="${quickState.form.blueTuoTotal}">
            </label>
        </div>
        <p class="helper-text">胆码和拖码都支持“部分自选 + 剩余随机”。如果某一栏一个都不选，就由随机模型把这一栏补满。</p>
    `;
    wrapper.appendChild(formCard);

    const aRed  = (quickState && quickState.isAutoMode) ? quickState.killedRed  : new Set();
    const aBlue = (quickState && quickState.isAutoMode) ? quickState.killedBlue : new Set();
    const exDanRed  = new Set([...quickState.custom.redTuo,  ...aRed]);
    const exTuoRed  = new Set([...quickState.custom.redDan,  ...aRed]);
    const exDanBlue = new Set([...quickState.custom.blueTuo, ...aBlue]);
    const exTuoBlue = new Set([...quickState.custom.blueDan, ...aBlue]);
    wrapper.appendChild(renderQuickPicker('自选红球胆码', 'redDan',  'red',  config.redMax,  quickState.custom.redDan,  quickState.form.redDanTotal,  exDanRed));
    wrapper.appendChild(renderQuickPicker('自选红球拖码', 'redTuo',  'red',  config.redMax,  quickState.custom.redTuo,  quickState.form.redTuoTotal,  exTuoRed));
    wrapper.appendChild(renderQuickPicker('自选蓝球胆码', 'blueDan', 'blue', config.blueMax, quickState.custom.blueDan, quickState.form.blueDanTotal, exDanBlue));
    wrapper.appendChild(renderQuickPicker('自选蓝球拖码', 'blueTuo', 'blue', config.blueMax, quickState.custom.blueTuo, quickState.form.blueTuoTotal, exTuoBlue));

    return wrapper;
}

function renderQuickPage() {
    if (!quickState) return;
    // k8 使用专用页面
    if (LOTTERY_CONFIG[quickState.game].isK8) { renderK8Page(false); return; }

    subpageContent.innerHTML = '';

    const builder = document.createElement('section');
    builder.className = 'quick-builder';

    // 自动选号模式：顶部显示已杀号码提示
    if (quickState.isAutoMode && quickState.killedRed.size > 0) {
        const killNote = document.createElement('div');
        killNote.className = 'auto-mode-note';
        let noteText = `已杀红球：${formatNums(sortAsc([...quickState.killedRed]))}`;
        if (quickState.killedBlue.size > 0) {
            noteText += `　　已杀蓝球：${formatNums(sortAsc([...quickState.killedBlue]))}`;
        }
        killNote.textContent = noteText;
        builder.appendChild(killNote);
    }

    const switcher = document.createElement('div');
    switcher.className = 'mode-switch';
    switcher.innerHTML = `
        <button class="mode-tab${quickState.mode === 'single' ? ' active' : ''}" data-mode="single" type="button">单式</button>
        <button class="mode-tab${quickState.mode === 'multiple' ? ' active' : ''}" data-mode="multiple" type="button">复式</button>
        <button class="mode-tab${quickState.mode === 'dantuo' ? ' active' : ''}" data-mode="dantuo" type="button">胆拖</button>
    `;
    builder.appendChild(switcher);

    if (quickState.mode === 'single') {
        builder.appendChild(renderSingleModePanel());
    } else if (quickState.mode === 'multiple') {
        builder.appendChild(renderMultipleModePanel());
    } else {
        builder.appendChild(renderDantuoModePanel());
    }

    const actionBar = document.createElement('div');
    actionBar.className = 'actions-bar';
    actionBar.innerHTML = `<button class="generate-btn" data-action="generate-quick" type="button" ${quickState.generating ? 'disabled' : ''}>${quickState.generating ? '生成中...' : '开始生成'}</button>`;
    builder.appendChild(actionBar);

    if (quickState.error) {
        const error = document.createElement('div');
        error.className = 'error-banner';
        error.textContent = quickState.error;
        builder.appendChild(error);
    }

    subpageContent.appendChild(builder);

    const resultSection = document.createElement('section');
    resultSection.className = 'preview-card';
    resultSection.innerHTML = '<h3 class="preview-title">生成结果</h3>';
    resultSection.appendChild(renderReceiptResults(quickState.results, quickState.game, quickState.mode, quickState.form));
    subpageContent.appendChild(resultSection);
}

/* ── 自动选号页面渲染（杀号流程）── */
function renderAutoPage() {
    if (!quickState || !quickState.isAutoMode) return;
    // k8 使用专用页面
    if (LOTTERY_CONFIG[quickState.game].isK8) { renderK8Page(true); return; }
    subpageContent.innerHTML = '';

    // 读取当前彺号组数配置
    const killGroupCount = getSelectorConfig()[quickState.game]?.killGroupCount || 4;

    if (quickState.step === 'start') {
        const card = document.createElement('div');
        card.className = 'auto-step-card';
        const gameName = LOTTERY_CONFIG[quickState.game].name;
        const killNote = quickState.game === 'ssq'
            ? '双色球只对红球做杀号，蓝球不受影响。'
            : '大乐透对红球和蓝球都做杀号。';
        card.innerHTML = `
            <h3 class="auto-step-title">第一步：生成杀号组</h3>
            <p class="auto-step-desc">点击「开始选号」后，系统自动生成 ${killGroupCount} 组${gameName}号码，以第 ${killGroupCount} 组为杀号组，从后续号码池中排除这些号码，再进行最终选号配置。</p>
            <p class="auto-step-desc">${killNote}</p>
            <button class="auto-start-btn" data-action="auto-start" type="button">开始选号</button>
        `;
        subpageContent.appendChild(card);

    } else if (quickState.step === 'kill') {
        const card = document.createElement('div');
        card.className = 'auto-step-card';
        card.innerHTML = `<h3 class="auto-step-title">第一步：杀号确认</h3>
            <p class="auto-step-desc">以下是自动生成的 ${killGroupCount} 组参考号码，第 ${killGroupCount} 组（标红）为杀号组，其号码将从后续球池中排除。</p>`;

        const groupsDiv = document.createElement('div');
        groupsDiv.className = 'auto-kill-groups';
        quickState.killGroups.forEach((group, idx) => {
            const row = document.createElement('div');
            const isKill = idx === quickState.killGroups.length - 1;
            row.className = `auto-kill-group-row${isKill ? ' is-kill' : ''}`;
            const label = isKill ? `第${killGroupCount}组 ★` : `第${idx + 1}组　`;
            let content = `<span class="auto-kill-label">${label}</span>红:${formatNums(group.red)}`;
            if (group.blue && group.blue.length) content += `  蓝:${formatNums(group.blue)}`;
            if (isKill) content += '　← 杀号组';
            row.innerHTML = content;
            groupsDiv.appendChild(row);
        });
        card.appendChild(groupsDiv);

        const summary = document.createElement('div');
        summary.className = 'killed-summary';
        let summaryText = `已杀红球：${formatNums(sortAsc([...quickState.killedRed]))}`;
        if (quickState.killedBlue.size > 0) {
            summaryText += `\n已杀蓝球：${formatNums(sortAsc([...quickState.killedBlue]))}`;
        }
        summary.style.whiteSpace = 'pre';
        summary.textContent = summaryText;
        card.appendChild(summary);

        const p = document.createElement('p');
        p.className = 'auto-step-desc';
        p.textContent = '确认后从剩余球池进行选号配置。';
        card.appendChild(p);

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'auto-confirm-btn';
        confirmBtn.dataset.action = 'confirm-kill';
        confirmBtn.type = 'button';
        confirmBtn.textContent = '确认杀号，开始选号';
        card.appendChild(confirmBtn);

        subpageContent.appendChild(card);

    } else if (quickState.step === 'configure') {
        renderQuickPage();
    }
}

function openSubpage(pageKey) {
    const page = SUBPAGES[pageKey];
    if (!page) return;

    activePageKey = pageKey;
    subpageTitle.textContent = page.title;
    subpageDesc.textContent = page.desc;

    if (LIFE_SIM_PAGE_KEYS.has(pageKey)) {
        // 废弃默认的「统一随机模型」说明栏（life-sim 有自己的 UI）
        modelNoteText.textContent = '';
        const modelNoteEl = document.querySelector('.model-note');
        if (modelNoteEl) modelNoteEl.style.display = 'none';
        quickState = null;
        lifeSimState = createLifeSimState();
        renderLifeSimPage();
    } else if (MISS_PAGE_KEYS.has(pageKey)) {
        // 错过100万了吗：隱藏 model-note，初始化状态
        modelNoteText.textContent = '';
        const modelNoteElMiss = document.querySelector('.model-note');
        if (modelNoteElMiss) modelNoteElMiss.style.display = 'none';
        quickState = null;
        lifeSimState = null;
        missState = createMissState('ssq');
        renderMissPage();
    } else if (VALIDATOR_PAGE_KEYS.has(pageKey)) {
        modelNoteText.textContent = '';
        const modelNoteElV = document.querySelector('.model-note');
        if (modelNoteElV) modelNoteElV.style.display = 'none';
        quickState = null;
        lifeSimState = null;
        validatorState = createValidatorState();
        renderValidatorPage();
    } else if (VLOG_PAGE_KEYS.has(pageKey)) {
        modelNoteText.textContent = '';
        const modelNoteElVL = document.querySelector('.model-note');
        if (modelNoteElVL) modelNoteElVL.style.display = 'none';
        quickState = null;
        lifeSimState = null;
        manualCheckState = createManualCheckState();
        renderValidationLogPage();
    } else {
        // 恢复 model-note 显示
        modelNoteText.textContent = getModelDescription();
        const modelNoteEl = document.querySelector('.model-note');
        if (modelNoteEl) modelNoteEl.style.display = '';

        if (QUICK_PAGE_KEYS.has(pageKey)) {
            quickState = createQuickState(page.game, pageKey);
            renderQuickPage();
        } else if (AUTO_PAGE_KEYS.has(pageKey)) {
            quickState = createAutoState(page.game, pageKey);
            renderAutoPage();
        } else {
            quickState = null;
            subpageContent.innerHTML = '';
            subpageContent.appendChild(renderPlaceholderContent(pageKey));
        }
    }

    homeView.classList.add('hidden');
    subpageView.classList.remove('hidden');
}

function goHome() {
    // 终止正在运行的 life-sim worker
    if (lifeSimWorker) { lifeSimWorker.terminate(); lifeSimWorker = null; }
    lifeSimState = null;
    missState = null;
    // 恢复 model-note 显示（以防从 life-sim 页回来）
    const modelNoteEl = document.querySelector('.model-note');
    if (modelNoteEl) modelNoteEl.style.display = '';
    activePageKey = null;
    subpageView.classList.add('hidden');
    homeView.classList.remove('hidden');
}

function updateQuickField(field, rawValue) {
    if (!quickState) return;
    const config = LOTTERY_CONFIG[quickState.game];
    const value = Number.parseInt(rawValue, 10);
    if (Number.isNaN(value)) return;

    switch (field) {
        case 'generateCount':
            quickState.form.generateCount = Math.min(50, Math.max(1, value));
            break;
        case 'multipleRedTotal':
            if (config.isK8) {
                const sc = quickState.k8SelectMode || 8;
                quickState.form.multipleRedTotal = Math.min(config.redMax, Math.max(sc + 1, value));
            } else {
                quickState.form.multipleRedTotal = Math.min(config.redMax, Math.max(config.redCount, value));
            }
            break;
        case 'multipleBlueTotal':
            quickState.form.multipleBlueTotal = Math.min(config.blueMax, Math.max(config.blueCount, value));
            break;
        case 'redDanTotal':
            if (config.isK8) {
                const scDan = quickState.k8SelectMode || 8;
                quickState.form.redDanTotal = Math.min(scDan - 1, Math.max(1, value));
            } else {
                quickState.form.redDanTotal = Math.min(config.redCount - 1, Math.max(config.redDanMin, value));
            }
            break;
        case 'redTuoTotal':
            quickState.form.redTuoTotal = Math.min(config.redMax, Math.max(1, value));
            break;
        case 'blueDanTotal':
            quickState.form.blueDanTotal = Math.min(config.blueDanMax, Math.max(0, value));
            break;
        case 'blueTuoTotal':
            quickState.form.blueTuoTotal = Math.min(config.blueMax, Math.max(0, value));
            break;
        default:
            return;
    }

    normalizeQuickSelections();
    quickState.error = '';
    quickState.results = [];
    rerenderPage();
}

function rerenderPage() {
    if (quickState && quickState.isAutoMode) { renderAutoPage(); } else { renderQuickPage(); }
}

function toggleQuickSelection(group, number) {
    if (!quickState) return;

    const set = quickState.custom[group];
    if (!set) return;

    if (set.has(number)) {
        set.delete(number);
        quickState.results = [];
        quickState.error = '';
        rerenderPage();
        return;
    }

    const limit = getQuickPickerLimit(group);
    if (set.size >= limit) return;

    if (group === 'redDan' && quickState.custom.redTuo.has(number)) return;
    if (group === 'redTuo' && quickState.custom.redDan.has(number)) return;
    if (group === 'blueDan' && quickState.custom.blueTuo.has(number)) return;
    if (group === 'blueTuo' && quickState.custom.blueDan.has(number)) return;

    set.add(number);
    normalizeQuickSelections();
    quickState.results = [];
    quickState.error = '';
    rerenderPage();
}

function generateSingleTicket(game) {
    const config = LOTTERY_CONFIG[game];
    const isK8 = config.isK8;
    const sc = isK8 ? (quickState ? quickState.k8SelectMode || 8 : 8) : config.redCount;
    const killedRed  = (quickState && quickState.isAutoMode) ? quickState.killedRed  : new Set();
    const killedBlue = (quickState && quickState.isAutoMode) ? quickState.killedBlue : new Set();
    const redMax = isK8 ? config.ballMax : config.redMax;
    const redPool  = buildPool(redMax, killedRed);
    const bluePool = config.blueCount > 0 ? buildPool(config.blueMax, killedBlue) : [];
    const red  = simulatePhysicalDrawFromPool(redPool,  sc).drawn;
    const blue = config.blueCount > 0 ? simulatePhysicalDrawFromPool(bluePool, config.blueCount).drawn : [];
    return {
        mode: 'single',
        red,
        blue,
        k8SelectMode: isK8 ? sc : undefined,
        manual: { red: new Set(), blue: new Set() },
        summary: ''
    };
}

function generateMultipleTicket(game) {
    const config = LOTTERY_CONFIG[game];
    const isK8 = config.isK8;
    const redMax = isK8 ? config.ballMax : config.redMax;
    const killedRed  = (quickState && quickState.isAutoMode) ? [...quickState.killedRed]  : [];
    const killedBlue = (quickState && quickState.isAutoMode) ? [...quickState.killedBlue] : [];
    const redManual  = sortAsc([...quickState.custom.multipleRed]);
    const blueManual = isK8 ? [] : sortAsc([...quickState.custom.multipleBlue]);
    const redRandomCount  = quickState.form.multipleRedTotal  - redManual.length;
    const blueRandomCount = isK8 ? 0 : (quickState.form.multipleBlueTotal - blueManual.length);

    const redRandom  = drawRemaining(redMax, [...redManual, ...killedRed], redRandomCount);
    const blueRandom = isK8 ? [] : drawRemaining(config.blueMax, [...blueManual, ...killedBlue], blueRandomCount);

    const sc = isK8 ? (quickState ? quickState.k8SelectMode || 8 : 8) : undefined;
    return {
        mode: 'multiple',
        red:  sortAsc([...redManual,  ...redRandom]),
        blue: sortAsc([...blueManual, ...blueRandom]),
        k8SelectMode: isK8 ? sc : undefined,
        manual: { red: new Set(redManual), blue: new Set(blueManual) },
        summary: ''
    };
}

function fillDanArea(max, manualNumbers, blockedNumbers, totalCount) {
    const randomCount = totalCount - manualNumbers.length;
    const randomNumbers = drawRemaining(max, [...manualNumbers, ...blockedNumbers], randomCount);
    return sortAsc([...manualNumbers, ...randomNumbers]);
}

function generateDanTuoTicket(game) {
    const config = LOTTERY_CONFIG[game];
    const isK8 = config.isK8;
    const redMax = isK8 ? config.ballMax : config.redMax;
    const killedRed  = (quickState && quickState.isAutoMode) ? [...quickState.killedRed]  : [];
    const killedBlue = (quickState && quickState.isAutoMode) ? [...quickState.killedBlue] : [];
    const redDanManual  = sortAsc([...quickState.custom.redDan]);
    const redTuoManual  = sortAsc([...quickState.custom.redTuo]);
    const blueDanManual = isK8 ? [] : sortAsc([...quickState.custom.blueDan]);
    const blueTuoManual = isK8 ? [] : sortAsc([...quickState.custom.blueTuo]);

    const redDan = fillDanArea(redMax, redDanManual, [...redTuoManual, ...killedRed], quickState.form.redDanTotal);
    const redTuo = sortAsc([
        ...redTuoManual,
        ...drawRemaining(redMax, [...redDan, ...redTuoManual, ...killedRed], quickState.form.redTuoTotal - redTuoManual.length)
    ]);
    const blueDan = isK8 ? [] : fillDanArea(config.blueMax, blueDanManual, [...blueTuoManual, ...killedBlue], quickState.form.blueDanTotal);
    const blueTuo = isK8 ? [] : sortAsc([
        ...blueTuoManual,
        ...drawRemaining(config.blueMax, [...blueDan, ...blueTuoManual, ...killedBlue], quickState.form.blueTuoTotal - blueTuoManual.length)
    ]);

    return {
        mode: 'dantuo',
        redDan,
        redTuo,
        blueDan,
        blueTuo,
        manual: {
            redDan:  new Set(redDanManual),
            redTuo:  new Set(redTuoManual),
            blueDan: new Set(blueDanManual),
            blueTuo: new Set(blueTuoManual)
        },
        summary: `红胆码自选 ${redDanManual.length} 个、随机补 ${quickState.form.redDanTotal - redDanManual.length} 个；红拖码自选 ${redTuoManual.length} 个、随机补 ${quickState.form.redTuoTotal - redTuoManual.length} 个。`
    };
}

function validateQuickState() {
    if (!quickState) return '当前页面状态无效。';
    const config = LOTTERY_CONFIG[quickState.game];
    const form = quickState.form;

    if (form.generateCount < 1 || form.generateCount > 50) {
        return '生成组数需要在 1 到 50 之间。';
    }

    // k8 专用校验
    if (config.isK8) {
        const sc = quickState.k8SelectMode || 8;
        if (quickState.mode === 'dantuo' && sc < 2) {
            return '选一玩法不支持胆拖，请选择选二或以上的玩法。';
        }
        if (quickState.mode === 'multiple') {
            if (form.multipleRedTotal <= sc || form.multipleRedTotal > config.ballMax) {
                return `复式红球总数需要大于 ${sc} 且不超过 ${config.ballMax}。`;
            }
        }
        if (quickState.mode === 'dantuo') {
            if (form.redDanTotal < 1 || form.redDanTotal >= sc) {
                return `胆码数量需要在 1 到 ${sc - 1} 之间。`;
            }
            if (form.redDanTotal + form.redTuoTotal <= sc) {
                return `胆码 + 拖码至少需要 ${sc + 1} 个。`;
            }
        }
        return '';
    }

    if (quickState.mode === 'multiple') {
        if (form.multipleRedTotal < config.redCount || form.multipleRedTotal > config.redMax) {
            return `红球总数需要在 ${config.redCount} 到 ${config.redMax} 之间。`;
        }
        if (form.multipleBlueTotal < config.blueCount || form.multipleBlueTotal > config.blueMax) {
            return `蓝球总数需要在 ${config.blueCount} 到 ${config.blueMax} 之间。`;
        }
    }

    if (quickState.mode === 'dantuo') {
        if (form.redDanTotal < config.redDanMin || form.redDanTotal >= config.redCount) {
            return `红球胆码需要在 ${config.redDanMin} 到 ${config.redCount - 1} 之间。`;
        }
        if (form.redDanTotal + form.redTuoTotal < config.redCount) {
            return `红球胆码 + 拖码至少需要 ${config.redCount} 个。`;
        }
        if (form.blueDanTotal < 0 || form.blueDanTotal > config.blueDanMax) {
            return `蓝球胆码不能超过 ${config.blueDanMax} 个。`;
        }
        if (form.blueDanTotal + form.blueTuoTotal < config.blueCount) {
            return `蓝球胆码 + 拖码至少需要 ${config.blueCount} 个。`;
        }
        if (form.redDanTotal + form.redTuoTotal > config.redMax) {
            return '红球胆码和拖码总数超过了球池上限。';
        }
        if (form.blueDanTotal + form.blueTuoTotal > config.blueMax) {
            return '蓝球胆码和拖码总数超过了球池上限。';
        }
    }

    return '';
}

async function handleGenerateQuick() {
    if (!quickState) return;
    if (quickState.generating) return;
    quickState.error = validateQuickState();
    if (quickState.error) {
        renderQuickPage();
        return;
    }

    quickState.generating = true;
    renderQuickPage();

    try {
        const results = [];
        const needAutoDelay = quickState.isAutoMode && quickState.form.generateCount > 1;

        for (let i = 0; i < quickState.form.generateCount; i += 1) {
            // 无论是否自动模式，多注生成均应用差异化逻辑，避免连续出现大量重复号码
            results.push(createAutoDiverseTicket(quickState.game, quickState.mode, results));

            if (needAutoDelay && i < quickState.form.generateCount - 1) {
                await waitForNextAutoGroup();
            }
        }

        quickState.error = '';
        quickState.results = results;
    } finally {
        quickState.generating = false;
        renderQuickPage();
    }
}

/* ── 卡片标题随机渐变色 ──
   每次页面加载时随机为每张卡片的标题分配一个渐变色方案，
   方案高度精选、带点 Apple 调色感觉，每张卡片不重复。 */
(function applyCardTitleGradients() {
    /* 预设渐变方案库：[from, to]，呼吸感高、对比度适中 */
    const GRADIENTS = [
        ['#007aff', '#5ac8fa'],   /* Apple 蓝 */
        ['#ff2d55', '#ff6b81'],   /* 粉红 */
        ['#34c759', '#30d158'],   /* 了草绿 */
        ['#af52de', '#bf5af2'],   /* 紫色 */
        ['#ff9500', '#ff6000'],   /* 橙色 */
        ['#5ac8fa', '#007aff'],   /* 天蓝反向 */
        ['#ff375f', '#af52de'],   /* 红到紫 */
        ['#30b0c7', '#34c759'],   /* 青绿 */
        ['#ff9f0a', '#ff2d55'],   /* 深橙到粉红 */
    ];

    /* 随机洗牌，保证前 N 张卡片不重复 */
    const pool = [...GRADIENTS];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    document.querySelectorAll('.nav-card-title').forEach((el, idx) => {
        const [from, to] = pool[idx % pool.length];
        /* 渐变文字：通过 background-clip: text 实现 */
        Object.assign(el.style, {
            background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
            webkitBackgroundClip: 'text',
            webkitTextFillColor: 'transparent',
            backgroundClip: 'text',
        });
    });
}());

navCards.forEach(card => {
    card.addEventListener('click', () => {
        openSubpage(card.dataset.page);
    });
});

/* ══════════════════════════════════════════════════════════════
   导航卡片拖拽排序
   · 长按 420ms 进入拖拽模式，支持鼠标和触摸
   · 拖拽结束后顺序持久化到 localStorage
   ══════════════════════════════════════════════════════════════ */
const NAV_ORDER_KEY = 'nav_card_order_v1';

function loadNavOrder() {
    try { return JSON.parse(localStorage.getItem(NAV_ORDER_KEY) || 'null'); }
    catch (_) { return null; }
}

function saveNavOrder(order) {
    try { localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order)); } catch (_) {}
}

// 页面加载时按上次保存的顺序重排卡片
(function applyNavOrder() {
    const order = loadNavOrder();
    if (!order || !order.length) return;
    const grid = document.querySelector('.nav-grid');
    if (!grid) return;
    const map = {};
    grid.querySelectorAll('.nav-card').forEach(c => { map[c.dataset.page] = c; });
    order.forEach(k => { if (map[k]) grid.appendChild(map[k]); });
}());

(function initNavDragSort() {
    const grid = document.querySelector('.nav-grid');
    if (!grid) return;

    let dragCard = null;
    let ghost    = null;
    let pholder  = null;
    let timer    = null;
    let active   = false;
    let blocked  = false;  // 拖拽结束后拦截 click，防止误触导航
    let sx = 0, sy = 0;
    const LONG_MS = 420;

    function getPageOrder() {
        return Array.from(grid.querySelectorAll('.nav-card')).map(c => c.dataset.page);
    }

    function clearPressing() {
        grid.querySelectorAll('.is-pressing').forEach(c => c.classList.remove('is-pressing'));
    }

    function startDrag(card, cx, cy) {
        active   = true;
        blocked  = true;
        dragCard = card;
        clearPressing();
        if (navigator.vibrate) navigator.vibrate(30);

        const rect = card.getBoundingClientRect();

        // 幽灵：随指针浮动的克隆
        ghost = card.cloneNode(true);
        ghost.className = 'nav-card nav-card--ghost';
        ghost.style.cssText = [
            'position:fixed',
            `left:${rect.left}px`, `top:${rect.top}px`,
            `width:${rect.width}px`, `height:${rect.height}px`,
            'pointer-events:none', 'z-index:9999',
            'opacity:0.9',
            'transform:scale(1.06) rotate(1.5deg)',
            'box-shadow:0 18px 40px rgba(0,0,0,0.2)',
        ].join(';');
        ghost._ox = cx - rect.left;
        ghost._oy = cy - rect.top;
        document.body.appendChild(ghost);

        // 占位符（空槽位）
        pholder = document.createElement('div');
        pholder.className = 'nav-card--placeholder';
        pholder.style.cssText = `width:${rect.width}px;height:${rect.height}px;`;
        grid.insertBefore(pholder, card);
        card.style.display = 'none';
    }

    function moveDrag(cx, cy) {
        if (!active || !ghost) return;
        ghost.style.left = `${cx - ghost._ox}px`;
        ghost.style.top  = `${cy - ghost._oy}px`;

        // 找出指针下方的卡片并移动占位符
        ghost.style.visibility = 'hidden';
        const el = document.elementFromPoint(cx, cy);
        ghost.style.visibility = '';

        const over = el && el.closest('.nav-card');
        if (over && over !== dragCard) {
            const r = over.getBoundingClientRect();
            const before = cx < r.left + r.width / 2;
            grid.insertBefore(pholder, before ? over : over.nextSibling);
        }
    }

    function endDrag() {
        if (timer) { clearTimeout(timer); timer = null; }
        clearPressing();
        if (!active) { blocked = false; return; }
        active = false;

        if (ghost) { ghost.remove(); ghost = null; }
        if (dragCard && pholder) {
            dragCard.style.display = '';
            pholder.replaceWith(dragCard);
            pholder = null;
            saveNavOrder(getPageOrder());
        }
        dragCard = null;
        // 稍后清除 blocked，确保本次触发的 click 被拦截
        setTimeout(() => { blocked = false; }, 80);
    }

    function cancelAll() {
        if (timer) { clearTimeout(timer); timer = null; }
        clearPressing();
        if (active) endDrag();
    }

    // 拖拽结束后拦截 click，防止进入子页面
    grid.addEventListener('click', e => {
        if (blocked) e.stopImmediatePropagation();
    }, true);

    // ── 鼠标事件 ──────────────────────────────────────────────
    grid.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const card = e.target.closest('.nav-card');
        if (!card) return;
        sx = e.clientX; sy = e.clientY;
        card.classList.add('is-pressing');
        timer = setTimeout(() => startDrag(card, e.clientX, e.clientY), LONG_MS);
    });

    document.addEventListener('mousemove', e => {
        if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) {
            clearTimeout(timer); timer = null;
            clearPressing();
        }
        if (active) moveDrag(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', () => {
        clearPressing();
        endDrag();
    });

    // ── 触摸事件 ──────────────────────────────────────────────
    grid.addEventListener('touchstart', e => {
        const card = e.target.closest('.nav-card');
        if (!card) return;
        const t = e.touches[0];
        sx = t.clientX; sy = t.clientY;
        card.classList.add('is-pressing');
        timer = setTimeout(() => startDrag(card, t.clientX, t.clientY), LONG_MS);
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        const t = e.touches[0];
        if (timer && Math.hypot(t.clientX - sx, t.clientY - sy) > 8) {
            clearTimeout(timer); timer = null;
            clearPressing();
        }
        if (active) { e.preventDefault(); moveDrag(t.clientX, t.clientY); }
    }, { passive: false });

    document.addEventListener('touchend', () => {
        clearPressing();
        endDrag();
    });
    document.addEventListener('touchcancel', cancelAll);
}());

backHomeBtn.addEventListener('click', goHome);

subpageContent.addEventListener('click', event => {
    // ── stepper 加减按钮（K8 面板专用）──
    const stepperBtn = event.target.closest('.stepper-btn');
    if (stepperBtn && quickState) {
        const field = stepperBtn.dataset.field;
        const delta = parseInt(stepperBtn.dataset.delta, 10);
        if (field && !Number.isNaN(delta)) {
            updateQuickField(field, (quickState.form[field] || 0) + delta);
            return;
        }
    }

    // ── K8 自动选号：开始生成参考组 ──
    if (event.target.closest('[data-action="k8-auto-start"]') && quickState && quickState.isAutoMode) {
        handleK8AutoStart();
        return;
    }

    // ── K8 自动选号：确认杀号 ──
    if (event.target.closest('[data-action="k8-confirm-kill"]') && quickState && quickState.isAutoMode) {
        handleK8ConfirmKill();
        return;
    }

    // ── K8 参考组展开/收起 ──
    if (event.target.closest('[data-action="k8-toggle-groups"]') && quickState) {
        quickState.k8GroupsExpanded = !quickState.k8GroupsExpanded;
        renderK8Page(true);
        return;
    }

    // ── K8 选法切换 ──
    const k8ModeTab = event.target.closest('[data-k8-mode]');
    if (k8ModeTab && quickState && quickState.game === 'k8') {
        quickState.k8SelectMode = parseInt(k8ModeTab.dataset.k8Mode, 10);
        quickState.error = '';
        quickState.results = [];
        normalizeQuickSelections();
        quickState.isAutoMode ? renderK8Page(true) : renderK8Page(false);
        return;
    }

    // ── 自动选号：开始生成杀号 ──
    if (event.target.closest('[data-action="auto-start"]') && quickState && quickState.isAutoMode) {
        const killGroupCount = getSelectorConfig()[quickState.game]?.killGroupCount || 4;
        quickState.killGroups = [];
        for (let i = 0; i < killGroupCount; i++) {
            quickState.killGroups.push(generateLotteryByMachine(quickState.game));
        }
        const killGroup = quickState.killGroups[killGroupCount - 1];
        quickState.killedRed  = new Set(killGroup.red);
        quickState.killedBlue = quickState.game === 'dlt' ? new Set(killGroup.blue) : new Set();
        quickState.step = 'kill';
        renderAutoPage();
        return;
    }

    // ── 自动选号：确认杀号，进入选号配置 ──
    if (event.target.closest('[data-action="confirm-kill"]') && quickState && quickState.isAutoMode) {
        quickState.step = 'configure';
        renderAutoPage();
        return;
    }

    const modeTab = event.target.closest('[data-mode]');
    if (modeTab && quickState) {
        quickState.mode = modeTab.dataset.mode;
        quickState.error = '';
        quickState.results = [];
        normalizeQuickSelections();
        quickState.isAutoMode ? renderAutoPage() : renderQuickPage();
        return;
    }

    const pickChip = event.target.closest('[data-pick-group]');
    if (pickChip && quickState) {
        toggleQuickSelection(pickChip.dataset.pickGroup, Number.parseInt(pickChip.dataset.number, 10));
        return;
    }

    const action = event.target.closest('[data-action="generate-quick"]');
    if (action && quickState) {
        handleGenerateQuick();
        return;
    }

    // ── 错过100万了吗：游戏切换 ──
    const missGameBtn = event.target.closest('[data-miss-action="switch-game"]');
    if (missGameBtn && missState) {
        const newGame = missGameBtn.dataset.missGame;
        missState = createMissState(newGame);
        renderMissPage();
        return;
    }

    // ── 错过100万了吗：玩法切换 ──
    const missBetBtn = event.target.closest('[data-miss-action="switch-bet"]');
    if (missBetBtn && missState) {
        missState.betType = missBetBtn.dataset.missBet;
        missState.singleRed.clear(); missState.singleBlue.clear();
        missState.multipleRed.clear(); missState.multipleBlue.clear();
        missState.danRed.clear(); missState.tuoRed.clear(); missState.danTuoBlue.clear();
        renderMissPage();
        return;
    }

    // ── 错过100万了吗：球选择 ──
    const missBallBtn = event.target.closest('[data-miss-ball]');
    if (missBallBtn && missState) {
        handleMissBallPick(missBallBtn);
        return;
    }

    // ── 错过100万了吗：开始对比 ──
    if (event.target.closest('[data-miss-action="start"]') && missState) {
        handleMissStart();
        return;
    }

    // ── 错过100万了吗：重新选号 ──
    if (event.target.closest('[data-miss-action="reset"]') && missState) {
        const prevGame = missState.game;
        missState = createMissState(prevGame);
        renderMissPage();
        return;
    }

    // ── 错过100万了吗：重试 ──
    if (event.target.closest('[data-miss-action="retry"]') && missState) {
        handleMissStart();
        return;
    }

    // ── 校验记录：清空全部 ──
    if (event.target.closest('[data-vlog-action="clearAll"]')) {
        if (confirm('确定要清空全部校验记录吗？')) {
            ValidationLog.clear();
            renderValidationLogPage();
        }
        return;
    }
    // ── 蒙特卡洛记录：更新选号策略 ──
    const stratBtn = event.target.closest('[data-mc-update-strategy]');
    if (stratBtn) {
        const recId = stratBtn.dataset.mcUpdateStrategy;
        const allRecs = ValidationLog.getAll();
        const rec = allRecs.find(r => r.id === recId);
        if (rec && rec.stats) {
            const gap = parseFloat(rec.stats.avgAllMissGap);
            // 用平均全零间隔直接映射到 killGroupCount，最低 1 组，无上限
            const newKillCount = Math.max(1, Math.round(gap));
            const game = rec.game;
            const SelectorConfig = getSelectorConfig();
            const oldKillCount = SelectorConfig[game]?.killGroupCount || 4;
            SelectorConfig[game] = { ...SelectorConfig[game], killGroupCount: newKillCount };
            saveSelectorConfig(SelectorConfig);
            const gameName = LOTTERY_CONFIG[game]?.name || game;
            // 写入校验记录
            ValidationLog.addAIAdjustment({
                game, k8SelectMode: rec.k8SelectMode,
                trigger: `蒙特卡洛平均全零间隔 ${gap} 期 → killGroupCount 调整`,
                aiResponse: '',
                paramsBefore: { killGroupCount: oldKillCount },
                paramsAfter:  { killGroupCount: newKillCount },
                reason: `平均全零间隔 ${gap} 期，四舍五入取 ${newKillCount} 组杀号`,
                changeApplied: true
            });
            alert(`✅ ${gameName}选号策略已更新\n杀号组数：${oldKillCount} → ${newKillCount}\n（依据：平均全零间隔 ${gap} 期）`);
            renderValidationLogPage();
        }
        return;
    }

    // ── 校验记录：回滚 ──
    const rollbackBtn = event.target.closest('[data-vlog-rollback]');
    if (rollbackBtn) {
        const id = rollbackBtn.dataset.vlogRollback;
        if (ValidationLog.rollback(id)) {
            renderValidationLogPage();
        }
        return;
    }
    // ── 蒙特卡洛校验：彩种切换 ──
    const mcGameBtn = event.target.closest('[data-mc-game]');
    if (mcGameBtn && manualCheckState) {
        manualCheckState.game = mcGameBtn.dataset.mcGame;
        manualCheckState.result = null;
        manualCheckState.error = '';
        renderValidationLogPage();
        return;
    }
    // ── 蒙特卡洛校验：K8 选法 ──
    const mcK8Btn = event.target.closest('[data-mc-k8-mode]');
    if (mcK8Btn && manualCheckState) {
        manualCheckState.k8SelectMode = parseInt(mcK8Btn.dataset.mcK8Mode, 10);
        manualCheckState.result = null;
        manualCheckState.error = '';
        renderValidationLogPage();
        return;
    }
    // ── 蒙特卡洛校验：期数切换 ──
    const mcWindowBtn = event.target.closest('[data-mc-window]');
    if (mcWindowBtn && manualCheckState) {
        manualCheckState.windowSize = parseInt(mcWindowBtn.dataset.mcWindow, 10);
        renderValidationLogPage();
        return;
    }
    // ── 蒙特卡洛校验：开始运行 ──
    if (event.target.closest('[data-mc-action="run"]') && manualCheckState && !manualCheckState.running) {
        manualCheckState.running = true;
        manualCheckState.progress = 0;
        manualCheckState.result = null;
        manualCheckState.error = '';
        renderValidationLogPage();
        setTimeout(() => { runManualCheck(); }, 30);
        return;
    }

    // ── 空号校验：彩种切换 ──
    const vGameBtn = event.target.closest('[data-v-game]');
    if (vGameBtn && validatorState) {
        validatorState.game = vGameBtn.dataset.vGame;
        validatorState.ticket = null;
        validatorState.report = null;
        validatorState.step = 'config';
        renderValidatorPage();
        return;
    }

    // ── 空号校验：K8选法切换（现已不显示，保留兼容） ──
    const vK8Btn = event.target.closest('[data-v-k8-mode]');
    if (vK8Btn && validatorState) {
        validatorState.k8SelectMode = parseInt(vK8Btn.dataset.vK8Mode, 10);
        validatorState.ticket = null;
        renderValidatorPage();
        return;
    }

    // ── 空号校验：期数切换 ──
    const vWindowBtn = event.target.closest('[data-v-window]');
    if (vWindowBtn && validatorState) {
        validatorState.windowSize = parseInt(vWindowBtn.dataset.vWindow, 10);
        renderValidatorPage();
        return;
    }

    // ── 空号校验：随机生成号码 / 开始验证 ──
    const vActionBtn = event.target.closest('[data-v-action]');
    if (vActionBtn && validatorState) {
        const vAct = vActionBtn.dataset.vAction;
        if (vAct === 'randomTicket') {
            const config = LOTTERY_CONFIG[validatorState.game];
            if (config.isK8) {
                const drawn = simulatePhysicalDrawFromPool(buildPool(80, new Set()), 20).drawn;
                validatorState.ticket = { mode: 'single', red: sortAsc(drawn), blue: [] };
            } else {
                const t = generateLotteryByMachine(validatorState.game);
                validatorState.ticket = { mode: 'single', red: sortAsc(t.red), blue: sortAsc(t.blue) };
            }
            renderValidatorPage();
            return;
        }
        if (vAct === 'runValidation') {
            runValidation();
            return;
        }
    }
});

subpageContent.addEventListener('change', event => {
    const field = event.target.dataset.field;
    if (field && quickState) {
        updateQuickField(field, event.target.value);
    }
});

/* ══════════════════════════════════════════════════════════════
   这辈子能中500万吗？—— 硬核彩票人生模拟器
   核心逻辑 + UI 渲染
   ══════════════════════════════════════════════════════════════ */

/* ── Web Worker 源码（以字符串形式内联，通过 Blob URL 创建） ── */
const LIFE_SIM_WORKER_SRC = `
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

self.onmessage = function(e) {
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
`;

/* ── 灵魂评语库 ── */
const LS_COMMENTS_LUCKY = [
    '🚀 卧槽！仅仅花了 ${years} 年你就中了！🤯 祖坟冒青烟了吧？建议今天出门不要踩井盖，运气可能透支了。⚡',
    '🎰 ${years} 年，才花了 ${cost} 元就中了 500 万，净赚 ${earned} 元！🎉 上辈子一定拯救了银河系，这辈子彩票系统向您致敬。🫡',
    '🌈 恭喜你在 ${years} 年内完成了普通人做梦都难以企及的壮举！🤩 建议立刻再买彩票，因为接下来的 ${restYears} 年可能都没这运气了。😅',
    '👑 真人真事：有人 ${years} 年买彩票，中了 500 万，扣完税还剩375万。您也做到了！🏆 您是天选之子，是概率学的异类，是数学的叛徒。',
    '💰 用 ${years} 年换来 500 万，年化收益率远超理财！📈 不过温馨提示：这是奇迹，不是策略，请勿向您的孩子展示此成就并称之为"投资经验"。🙏',
];

const LS_COMMENTS_LOSE = [
    '💸 花了 ${years} 年，倒贴了 ${lostMoney} 元才摸到 500 万！😭 如果您从清朝同治年间开始买，现在可能刚刚回本。建议把这笔钱留给您的第 ${generations} 代玄孙去领奖吧。🪦',
    '💀 ${years} 年啊！😱 您的 ${generations} 代子孙轮番来买，终于中了。您从坟墓里伸出手领到了这张彩票，感受一下这份跨越历史的执念。💔 累计亏损：${lostMoney} 元。',
    '🥖 如果把您这 ${years} 年的 ${cost} 元换成馒头，叠起来可以从地球到月球绕 ${moonsRound} 圈。🌙 温馨提示：这些馒头至少能吃饱，但彩票不行。🤡',
    '🧘 您是人类历史上最坚韧的彩票人。💪 ${years} 年，${draws} 期，亏损 ${lostMoney} 元，最终以一种近乎哲学的方式证明了一件事：概率终究会收敛，代价只是您的整个人生。😵‍💫',
    '😂 ${years} 年后中奖，您的消息传遍了彩票大厅。所有工作人员都哭了，不是因为感动，而是因为您的彩票销售额撑起了他们 ${genCount} 代人的工资。🏦',
    '🏆 中了！就在 ${years} 年、亏掉 ${lostMoney} 元后！🎊 这时候 500 万是什么概念？已经无法弥补了，但至少您的执念可以入选吉尼斯世界纪录：史上最贵的 500 万。🥇',
    '🤔 告诉我，是什么让您坚持了 ${years} 年？是信念？是执念？🙃 还是对数学的深刻误解？不管怎样，您终于等到了这一天。😢 享受您净亏 ${lostMoney} 元的胜利吧。',
    '🏠 ${years} 年买彩票，最终成本 ${cost} 元，中奖 500 万，净亏 ${lostMoney} 元。如果您当年把这些钱全投进房地产……💔 算了，这个假设太残忍，我们不讨论。',
    '🎯 二等奖中了 ${second} 次，每次差一点儿！🤯 这就是彩票的浪漫：给你无数次"差点儿"，然后用 ${years} 年让你确信自己是天选之人。结局：😭 亏损 ${lostMoney} 元。',
    '🏃 人生最长的马拉松：${years} 年，${draws} 期，每期怀揣希望，每期落空而归 💔，直到第 ${draws} 期，终于！500 万到手。🎉 可惜您的钱包早在 ${ruinYear} 年就已牺牲。🪦',
];

/* 模板变量替换 */
function fillComment(template, vars) {
    return template.replace(/\$\{(\w+)\}/g, function(_, key) {
        return key in vars ? vars[key] : ('${' + key + '}');
    });
}

/* ── Life-sim 状态 ── */
let lifeSimState = null;
let lifeSimWorker = null;

function createLifeSimState() {
    return {
        betType: 'single',      // 'single' | 'multiple' | 'danTuo'
        pickMode: 'random',     // 'fixed' | 'random' (danTuo 时忽略，始终固定)
        // 执念守号 单式：手动选球（不足6红/1蓝则机选补齐）
        fixedRed: new Set(),
        fixedBlue: 0,
        // 执念守号 复式：自选锚定球，目标数量由下面两字段指定
        fixedMultipleRed: new Set(),
        fixedMultipleBlue: new Set(),
        fixedMultipleTargetRed: 9,    // 复式固定红球目标总数（含自选+机选补齐）
        fixedMultipleTargetBlue: 1,   // 复式固定蓝球目标总数
        // 复式随机：红蓝球数量
        multipleRedCount: 9,
        multipleBlueCount: 3,
        // 随缘瞎买 单式：每期注数
        singlePerPeriod: 5,
        // 胆拖模式
        danRed: new Set(),      // 胆码红球 (1-5 个)
        tuoRed: new Set(),      // 拖码红球
        danTuoBlue: new Set(),  // 蓝球 (1+ 个)
        // 每期买几组（复式/胆拖）
        groupsPerPeriod: 1,
        // 状态
        status: 'idle',         // 'idle' | 'running' | 'done'
        currentPeriods: 0,
        result: null,
        error: '',
        // 模拟开始时固定的票面（fixed/danTuo 模式用于展示）
        resolvedFixedTicket: null,
    };
}

/* 计算每期总注数（已含 groups） */
function lsTicketCount(st) {
    const gpp = st.betType !== 'single' ? (st.groupsPerPeriod || 1) : 1;
    if (st.betType === 'single') {
        return st.pickMode === 'fixed' ? 1 : st.singlePerPeriod;
    }
    if (st.betType === 'danTuo') {
        const dan = st.danRed.size;
        const tuo = st.tuoRed.size;
        const blue = Math.max(1, st.danTuoBlue.size);
        if (dan < 1 || tuo < (6 - dan)) return 0;
        return combination(tuo, 6 - dan) * blue * gpp;
    }
    // multiple
    if (st.pickMode === 'fixed') {
        const rc = st.fixedMultipleTargetRed || 9;
        const bc = st.fixedMultipleTargetBlue || 1;
        return combination(rc, 6) * bc * gpp;
    }
    return combination(st.multipleRedCount, 6) * st.multipleBlueCount * gpp;
}

/* 校验配置，返回错误字符串（空字符串=合法） */
function lsValidate(st) {
    if (st.betType !== 'single') {
        if (!Number.isInteger(st.groupsPerPeriod) || st.groupsPerPeriod < 1 || st.groupsPerPeriod > 1000)
            return '每期组数需在 1 到 1,000 之间。';
    }
    const tickets = lsTicketCount(st);
    if (st.betType === 'danTuo') {
        if (st.danRed.size < 1) return '请至少选择 1 个胆码红球。';
        if (st.danRed.size > 5) return '胆码红球最多 5 个。';
        const need = 6 - st.danRed.size;
        if (st.tuoRed.size < need) return `已选 ${st.danRed.size} 个胆码，还需至少 ${need} 个拖码红球。`;
        if (st.danTuoBlue.size < 1) return '请至少选择 1 个蓝球。';
        if (tickets > 10000) return `胆拖注数 ${tickets.toLocaleString()} 超出上限 10,000 注！请减少拖码/蓝球/组数。`;
        return '';
    }
    if (st.betType === 'multiple') {
        if (st.pickMode === 'fixed') {
            const tRed = st.fixedMultipleTargetRed;
            const tBlue = st.fixedMultipleTargetBlue;
            if (tRed < 6 || tRed > 33) return '目标红球数量必须在 6 到 33 之间。';
            if (tBlue < 1 || tBlue > 16) return '目标蓝球数量必须在 1 到 16 之间。';
        } else {
            if (st.multipleRedCount < 6 || st.multipleRedCount > 33) return '复式红球数量必须在 6 到 33 之间。';
            if (st.multipleBlueCount < 1 || st.multipleBlueCount > 16) return '复式蓝球数量必须在 1 到 16 之间。';
            if (st.multipleRedCount === 6 && st.multipleBlueCount === 1 && st.groupsPerPeriod === 1)
                return '复式模式下红球6个+蓝球1个等同于单式，请增加球数。';
        }
        if (tickets > 10000) return `复式注数 ${tickets.toLocaleString()} 超出单期上限 10,000 注！请减少球数或组数。`;
        return '';
    }
    if (st.betType === 'single' && st.pickMode === 'random') {
        if (st.singlePerPeriod < 1 || st.singlePerPeriod > 10000) return '每期注数须在 1 到 10,000 之间。';
    }
    return '';
}

/* 格式化大数字 */
function fmtNum(n) { return Math.round(n).toLocaleString('zh-CN'); }

/* ── 渲染主入口 ── */
function renderLifeSimPage() {
    subpageContent.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'ls-wrap';

    if (!lifeSimState || lifeSimState.status === 'idle') {
        wrap.appendChild(buildLsConfig());
    } else if (lifeSimState.status === 'running') {
        wrap.appendChild(buildLsRunning());
    } else {
        wrap.appendChild(buildLsDone());
    }
    subpageContent.appendChild(wrap);
}

/* ── 配置面板 ── */
function buildLsConfig() {
    const st = lifeSimState;
    const frag = document.createDocumentFragment();

    // 标题
    const title = document.createElement('p');
    title.className = 'ls-title';
    title.textContent = '这辈子能中500万吗？';
    frag.appendChild(title);
    const sub = document.createElement('p');
    sub.className = 'ls-subtitle';
    sub.textContent = '双色球一等奖 · 6红+1蓝 · 概率约 1/17,721,088 · 每期2元起';
    frag.appendChild(sub);

    // ── 投注方式 ──
    const betLabel = document.createElement('p');
    betLabel.className = 'ls-section-label';
    betLabel.textContent = '投注方式';
    frag.appendChild(betLabel);
    const betRow = document.createElement('div');
    betRow.className = 'ls-tab-row';
    [['single', '单式（每注6红+1蓝）'], ['multiple', '复式（多选）'], ['danTuo', '胆拖（胆码必中）']].forEach(([val, txt]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ls-tab' + (st.betType === val ? ' active' : '');
        btn.textContent = txt;
        btn.dataset.lsAction = 'bet-type';
        btn.dataset.lsVal = val;
        betRow.appendChild(btn);
    });
    frag.appendChild(betRow);

    // ── 选号模式（胆拖始终固定，隐藏此区域）──
    if (st.betType !== 'danTuo') {
        const pickLabel = document.createElement('p');
        pickLabel.className = 'ls-section-label';
        pickLabel.textContent = '选号模式';
        frag.appendChild(pickLabel);
        const pickRow = document.createElement('div');
        pickRow.className = 'ls-tab-row';
        [['fixed', '执念守号（固定号码）'], ['random', '随缘瞎买（每期随机）']].forEach(([val, txt]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ls-tab' + (st.pickMode === val ? ' active' : '');
            btn.textContent = txt;
            btn.dataset.lsAction = 'pick-mode';
            btn.dataset.lsVal = val;
            pickRow.appendChild(btn);
        });
        frag.appendChild(pickRow);
    }

    // ── 动态配置区 ──
    const configArea = document.createElement('div');
    configArea.className = 'ls-config-area';

    if (st.betType === 'single' && st.pickMode === 'fixed') {
        // 手动选 6 红 + 1 蓝
        configArea.appendChild(buildLsBallPicker('red-ball', '选红球（可不选，机器补齐至6个）', 33, st.fixedRed, 6, 'pick-red'));
        configArea.appendChild(buildLsBallPicker('blue-ball', '选蓝球（可不选，机器自动随机选1个）', 16, st.fixedBlue === 0 ? new Set() : new Set([st.fixedBlue]), 1, 'pick-blue'));
    } else if (st.betType === 'single' && st.pickMode === 'random') {
        // 每期注数输入
        const row = document.createElement('div');
        row.className = 'ls-number-row';
        const lbl = document.createElement('span');
        lbl.className = 'ls-number-label';
        lbl.textContent = '每期买几注：';
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'ls-number-input';
        inp.min = '1';
        inp.max = '10000';
        inp.value = st.singlePerPeriod;
        inp.dataset.lsField = 'singlePerPeriod';
        const hint = document.createElement('span');
        hint.className = 'ls-number-hint';
        hint.textContent = '（最多10,000注 / 期）';
        row.appendChild(lbl);
        row.appendChild(inp);
        row.appendChild(hint);
        configArea.appendChild(row);
    } else if (st.betType === 'multiple' && st.pickMode === 'fixed') {
        // 复式执念守号：目标数量 + 自选锚定球（不足由机器补）
        const tRed = st.fixedMultipleTargetRed, tBlue = st.fixedMultipleTargetBlue;
        const fixedNote = document.createElement('p');
        fixedNote.style.cssText = 'font-size:.8rem;color:#8888aa;margin:0 0 10px;';
        fixedNote.textContent = '先设好目标球数，再选你想"锁定"的号码，其余由机器随机补满。';
        configArea.appendChild(fixedNote);
        // 目标数量输入
        [['目标红球数量：', 'fixedMultipleTargetRed', 6, 33, tRed, '（6–33，将补满至此数）'],
         ['目标蓝球数量：', 'fixedMultipleTargetBlue', 1, 16, tBlue, '（1–16）']
        ].forEach(([lbTxt, field, min, max, val, hint]) => {
            const row = document.createElement('div');
            row.className = 'ls-number-row';
            const lbl = document.createElement('span');
            lbl.className = 'ls-number-label';
            lbl.textContent = lbTxt;
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.className = 'ls-number-input';
            inp.min = String(min);
            inp.max = String(max);
            inp.value = val;
            inp.dataset.lsField = field;
            const hintEl = document.createElement('span');
            hintEl.className = 'ls-number-hint';
            hintEl.textContent = hint;
            row.appendChild(lbl);
            row.appendChild(inp);
            row.appendChild(hintEl);
            configArea.appendChild(row);
        });
        // 锚定选球（限制不超过目标数）
        configArea.appendChild(buildLsBallPicker('red-ball',
            `锁定红球（已选 ${st.fixedMultipleRed.size}/${tRed}，其余机选补至 ${tRed} 个）`,
            33, st.fixedMultipleRed, tRed, 'pick-multiple-red'));
        configArea.appendChild(buildLsBallPicker('blue-ball',
            `锁定蓝球（已选 ${st.fixedMultipleBlue.size}/${tBlue}，其余机选补至 ${tBlue} 个）`,
            16, st.fixedMultipleBlue, tBlue, 'pick-multiple-blue'));
    } else if (st.betType === 'multiple' && st.pickMode === 'random') {
        // 复式随机：红蓝球数量
        [[' 红球数量（≥6）：', 'multipleRedCount', 6, 33, st.multipleRedCount],
         ['蓝球数量（≥1）：', 'multipleBlueCount', 1, 16, st.multipleBlueCount]
        ].forEach(([lbTxt, field, min, max, val]) => {
            const row = document.createElement('div');
            row.className = 'ls-number-row';
            const lbl = document.createElement('span');
            lbl.className = 'ls-number-label';
            lbl.textContent = lbTxt;
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.className = 'ls-number-input';
            inp.min = String(min);
            inp.max = String(max);
            inp.value = val;
            inp.dataset.lsField = field;
            const hint = document.createElement('span');
            hint.className = 'ls-number-hint';
            hint.textContent = `(${min}–${max})`;
            row.appendChild(lbl);
            row.appendChild(inp);
            row.appendChild(hint);
            configArea.appendChild(row);
        });
    } else if (st.betType === 'danTuo') {
        // 胆拖配置：胆码+拖码红球 + 蓝球
        configArea.appendChild(buildLsDanTuoRedPicker());
        configArea.appendChild(buildLsBallPicker('blue-ball',
            `选蓝球（已选 ${st.danTuoBlue.size} 个，至少1个）`,
            16, st.danTuoBlue, 16, 'pick-dantuo-blue'));
    }
    // ── 每期几组（复式/胆拖）──
    if (st.betType !== 'single') {
        const gRow = document.createElement('div');
        gRow.className = 'ls-number-row';
        const gLbl = document.createElement('span');
        gLbl.className = 'ls-number-label';
        gLbl.textContent = '每期买几组：';
        const gInp = document.createElement('input');
        gInp.type = 'number';
        gInp.className = 'ls-number-input';
        gInp.min = '1';
        gInp.max = '1000';
        gInp.value = st.groupsPerPeriod;
        gInp.dataset.lsField = 'groupsPerPeriod';
        const gHint = document.createElement('span');
        gHint.className = 'ls-number-hint';
        gHint.textContent = st.betType === 'danTuo' || st.pickMode === 'fixed'
            ? '（固定守号买多组，每组同样号码，增加花费但不提升中奖概率）'
            : '（每期买多组随机号码，注意总注数上限 10,000）';
        gRow.appendChild(gLbl);
        gRow.appendChild(gInp);
        gRow.appendChild(gHint);
        configArea.appendChild(gRow);
    }
    frag.appendChild(configArea);

    // ── 统计信息条 ──
    const tickets = lsTicketCount(st);
    const costPerPeriod = tickets * 2;
    const infoBar = document.createElement('div');
    infoBar.className = 'ls-info-bar';
    let infoItems;
    if (st.betType === 'danTuo') {
        const dan = st.danRed.size, tuo = st.tuoRed.size;
        infoItems = [
            ['胆码红球', dan ? dan + ' 个' : '未选'],
            ['拖码红球', tuo ? tuo + ' 个' : '未选'],
            ['每期注数', tickets === 0 ? '配置未完成' : (tickets > 10000 ? '超限！' : fmtNum(tickets) + ' 注')],
            ['每期花费', tickets === 0 ? '--' : (costPerPeriod > 20000 ? '超限！' : '¥' + fmtNum(costPerPeriod))],
        ];
    } else if (st.betType === 'multiple') {
        const perGroup = Math.round(tickets / (st.groupsPerPeriod || 1));
        infoItems = [
            ['每组注数', perGroup > 0 ? fmtNum(perGroup) + ' 注' : '配置未完成'],
            ['购买组数', fmtNum(st.groupsPerPeriod || 1) + ' 组'],
            ['每期总注数', tickets > 10000 ? '超限！' : fmtNum(tickets) + ' 注'],
            ['每期总花费', costPerPeriod > 20000 ? '超限！' : '¥' + fmtNum(costPerPeriod)],
        ];
    } else {
        infoItems = [
            ['每期注数', tickets > 10000 ? '超限！' : fmtNum(tickets) + ' 注'],
            ['每期花费', costPerPeriod > 20000 ? '超限！' : '¥' + fmtNum(costPerPeriod)],
            ['开奖频次', '每周3期 / 年156期'],
            ['一等奖概率', tickets === 0 ? '--' : '约 1/' + fmtNum(Math.round(17721088 / tickets))],
        ];
    }
    infoItems.forEach(([k, v]) => {
        const item = document.createElement('div');
        item.className = 'ls-info-item';
        const key = document.createElement('span');
        key.className = 'ls-info-key';
        key.textContent = k;
        const val = document.createElement('span');
        val.className = 'ls-info-val';
        if (v.startsWith('超限') || v === '配置未完成') val.style.color = '#ff4444';
        val.textContent = v;
        item.appendChild(key);
        item.appendChild(val);
        infoBar.appendChild(item);
    });
    frag.appendChild(infoBar);

    // ── 错误提示 ──
    if (st.error) {
        const err = document.createElement('div');
        err.className = 'ls-error';
        err.textContent = st.error;
        frag.appendChild(err);
    }

    // ── 开始按钮 ──
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'ls-start-btn';
    startBtn.textContent = '开始模拟一生 →';
    startBtn.dataset.lsAction = 'start';
    frag.appendChild(startBtn);

    return frag;
}

/* 胆拖红球三态选择器（未选 → 胆 → 拖 → 未选） */
function buildLsDanTuoRedPicker() {
    const st = lifeSimState;
    const wrap = document.createElement('div');
    wrap.className = 'ls-ball-picker';

    const lbl = document.createElement('p');
    lbl.className = 'ls-ball-picker-title';
    lbl.innerHTML = `点一次 = <b style="color:#c07000">胆码</b>，再点 = <b style="color:#3060cc">拖码</b>，再点取消&ensp;·&ensp;胆 <b>${st.danRed.size}</b>/5 个 &ensp; 拖 <b>${st.tuoRed.size}</b> 个`;
    wrap.appendChild(lbl);

    const grid = document.createElement('div');
    grid.className = 'ls-ball-grid';
    for (let i = 1; i <= 33; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isDan = st.danRed.has(i);
        const isTuo = st.tuoRed.has(i);
        btn.className = 'ls-ball red-ball' + (isDan ? ' ls-dan' : isTuo ? ' ls-tuo' : '');
        btn.textContent = String(i).padStart(2, '0');
        btn.dataset.lsAction = 'pick-dantuo-red';
        btn.dataset.lsNum = i;
        btn.title = isDan ? '胆码（再点→拖码）' : isTuo ? '拖码（再点→取消）' : '点击设为胆码';
        grid.appendChild(btn);
    }
    wrap.appendChild(grid);

    // 说明提示
    const hint = document.createElement('p');
    hint.className = 'ls-number-hint';
    hint.style.marginTop = '8px';
    hint.textContent = '胆码必须全部出现在开奖号里；拖码从中选取不足的球位组成完整一注。';
    wrap.appendChild(hint);

    return wrap;
}

/* 构建球选择器 */
function buildLsBallPicker(colorClass, labelText, max, selectedSet, limit, actionOverride) {
    const wrap = document.createElement('div');
    wrap.className = 'ls-ball-picker';
    const lbl = document.createElement('p');
    lbl.className = 'ls-ball-picker-title';
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    const grid = document.createElement('div');
    grid.className = 'ls-ball-grid';
    for (let i = 1; i <= max; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ls-ball ' + colorClass + (selectedSet.has(i) ? ' active' : '');
        btn.textContent = String(i).padStart(2, '0');
        btn.dataset.lsAction = actionOverride || (colorClass === 'red-ball' ? 'pick-red' : 'pick-blue');
        btn.dataset.lsNum = i;
        grid.appendChild(btn);
    }
    wrap.appendChild(grid);
    return wrap;
}

function buildLsRunning() {
    const st = lifeSimState;
    const frag = document.createDocumentFragment();

    const runDiv = document.createElement('div');
    runDiv.className = 'ls-running';

    const lbl = document.createElement('p');
    lbl.className = 'ls-running-label';
    lbl.textContent = '时光飞逝 · 模拟进行中…';
    runDiv.appendChild(lbl);

    const yearDisplay = document.createElement('div');
    yearDisplay.className = 'ls-year-display';
    const years = Math.floor(st.currentPeriods / 156);
    const yearNum = document.createElement('span');
    yearNum.className = 'ls-year-number';
    yearNum.id = 'lsYearNumber';
    yearNum.textContent = fmtNum(years);
    const yearUnit = document.createElement('span');
    yearUnit.className = 'ls-year-unit';
    yearUnit.textContent = '年';
    yearDisplay.appendChild(yearNum);
    yearDisplay.appendChild(yearUnit);
    runDiv.appendChild(yearDisplay);

    const periodEl = document.createElement('p');
    periodEl.className = 'ls-period-counter';
    periodEl.id = 'lsPeriodCounter';
    periodEl.textContent = '已开奖 ' + fmtNum(st.currentPeriods) + ' 期';
    runDiv.appendChild(periodEl);

    const bar = document.createElement('div');
    bar.className = 'ls-progress-bar';
    const fill = document.createElement('div');
    fill.className = 'ls-progress-fill';
    bar.appendChild(fill);
    runDiv.appendChild(bar);

    frag.appendChild(runDiv);
    return frag;
}

/* ── 结算结果面板 ── */
function buildLsDone() {
    const st = lifeSimState;
    const r = st.result;
    // 用一个 flex 容器统一控制间距
    const container = document.createElement('div');
    container.className = 'ls-result-done';

    const tickets = lsTicketCount(st);
    const costPerPeriod = tickets * 2;
    const totalCost = r.totalPeriods * costPerPeriod;
    const totalWin = 5000000 + r.secondPrizes * 500000;
    const netProfit = totalWin - totalCost;
    const totalYears = r.totalPeriods / 156;
    const years = Math.floor(totalYears);
    const months = Math.round((totalYears - years) * 12);
    const generations = Math.ceil(years / 30);
    const ruinYear = Math.floor(r.totalPeriods * 0.1 / 156); // "前10%时期"就开始亏了
    const moonsRound = Math.round(totalCost / 2 / 384400000 * 0.1); // 比喻

    // 评语变量
    const commentVars = {
        years: fmtNum(years),
        cost: '¥' + fmtNum(totalCost),
        lostMoney: '¥' + fmtNum(Math.abs(netProfit)),
        earned: '¥' + fmtNum(netProfit),
        draws: fmtNum(r.totalPeriods),
        second: fmtNum(r.secondPrizes),
        generations: fmtNum(generations),
        genCount: fmtNum(generations),
        ruinYear: fmtNum(ruinYear),
        restYears: fmtNum(Math.max(0, 80 - years)),
        moonsRound: fmtNum(Math.max(1, moonsRound)),
    };

    // 选评语
    const isLucky = netProfit > 0 && years <= 50;
    const pool = isLucky ? LS_COMMENTS_LUCKY : LS_COMMENTS_LOSE;
    const comment = fillComment(pool[Math.floor(Math.random() * pool.length)], commentVars);

    // ── 顶部 Banner ──
    const banner = document.createElement('div');
    banner.className = 'ls-result ls-result-banner';
    const emoji = document.createElement('div');
    emoji.className = 'ls-result-banner-emoji';
    emoji.textContent = r.capped ? '😵' : (isLucky ? '🎉' : '💸');
    const bTitle = document.createElement('div');
    bTitle.className = 'ls-result-banner-title';
    if (r.capped) {
        bTitle.textContent = '宇宙都等不及了，模拟器也放弃你了……';
    } else {
        bTitle.textContent = `历经 ${fmtNum(years)} 年 ${months} 个月，一共 ${fmtNum(r.totalPeriods)} 期，你终于中奖了${isLucky ? '！' : '，但是代价是……'}`;
    }
    const bSub = document.createElement('div');
    bSub.className = 'ls-result-banner-sub';
    bSub.textContent = r.capped ? '已超过5亿期安全上限，系统强制停止。' : '';
    banner.appendChild(emoji);
    banner.appendChild(bTitle);
    if (r.capped) banner.appendChild(bSub);
    container.appendChild(banner);

    // ── 数据卡片网格 ──
    const grid = document.createElement('div');
    grid.className = 'ls-result-grid';

    function makeCard(label, mainText, colorClass, subText) {
        const card = document.createElement('div');
        card.className = 'ls-result-card';
        const lbl = document.createElement('div');
        lbl.className = 'ls-result-card-label';
        lbl.textContent = label;
        const main = document.createElement('div');
        main.className = 'ls-result-card-main ' + colorClass;
        main.textContent = mainText;
        const sub = document.createElement('div');
        sub.className = 'ls-result-card-sub';
        sub.textContent = subText;
        card.appendChild(lbl);
        card.appendChild(main);
        card.appendChild(sub);
        return card;
    }

    grid.appendChild(makeCard('累计开奖期数', fmtNum(r.totalPeriods) + ' 期', 'cyan',
        `${fmtNum(years)} 年 ${months} 个月 / 跨越 ${fmtNum(generations)} 代人`));
    grid.appendChild(makeCard('累计投入本金', '¥' + fmtNum(totalCost), 'yellow',
        `每期 ¥${fmtNum(costPerPeriod)}，共 ${fmtNum(r.totalPeriods)} 期`));
    grid.appendChild(makeCard('累计中奖金额', '¥' + fmtNum(totalWin), 'green',
        `一等奖 ¥500万 + 二等奖×${fmtNum(r.secondPrizes)} 共 ¥${fmtNum(r.secondPrizes * 500000)}`));
    grid.appendChild(makeCard('二等奖次数', fmtNum(r.secondPrizes) + ' 次', 'cyan',
        '6红全中但蓝球落空，每次差一点点……'));
    container.appendChild(grid);

    // ── 大盈亏显示 ──
    if (netProfit < 0) {
        const lossDiv = document.createElement('div');
        lossDiv.className = 'ls-loss-display';
        const lossLbl = document.createElement('div');
        lossLbl.className = 'ls-loss-label';
        lossLbl.textContent = '💀 净亏损金额（血泪教训）';
        const lossAmt = document.createElement('div');
        lossAmt.className = 'ls-loss-amount';
        lossAmt.textContent = '-¥' + fmtNum(Math.abs(netProfit));
        lossDiv.appendChild(lossLbl);
        lossDiv.appendChild(lossAmt);
        container.appendChild(lossDiv);
    } else {
        const profDiv = document.createElement('div');
        profDiv.className = 'ls-profit-display';
        const profLbl = document.createElement('div');
        profLbl.className = 'ls-profit-label';
        profLbl.textContent = '🚀 净盈利（天命之人！）';
        const profAmt = document.createElement('div');
        profAmt.className = 'ls-profit-amount';
        profAmt.textContent = '+¥' + fmtNum(netProfit);
        profDiv.appendChild(profLbl);
        profDiv.appendChild(profAmt);
        container.appendChild(profDiv);
    }

    // ── 中奖号码展示（固定/胆拖模式） ──
    if (st.resolvedFixedTicket) {
        const tk = st.resolvedFixedTicket;
        const ticketDiv = document.createElement('div');
        ticketDiv.className = 'ls-fixed-ticket';
        if (tk.isDanTuo) {
            // 胆拖展示
            ticketDiv.innerHTML = '<span>本次胆拖：</span>';
            const ballRow = document.createElement('div');
            ballRow.className = 'ls-winning-ticket';
            ballRow.style.marginTop = '6px';
            const danLbl = document.createElement('span');
            danLbl.style.cssText = 'font-size:.72rem;color:#c07000;margin-right:4px;';
            danLbl.textContent = '胆';
            ballRow.appendChild(danLbl);
            tk.dan.forEach(n => {
                const b = document.createElement('span');
                b.className = 'ls-wball red ls-dan';
                b.textContent = String(n).padStart(2, '0');
                ballRow.appendChild(b);
            });
            const sep1 = document.createElement('span');
            sep1.style.cssText = 'color:#888;font-size:.8rem;margin:0 6px;';
            sep1.textContent = '拖';
            ballRow.appendChild(sep1);
            tk.tuo.forEach(n => {
                const b = document.createElement('span');
                b.className = 'ls-wball red ls-tuo';
                b.textContent = String(n).padStart(2, '0');
                ballRow.appendChild(b);
            });
            const sep2 = document.createElement('span');
            sep2.style.cssText = 'color:#444;font-size:.8rem;margin:0 4px;';
            sep2.textContent = '＋';
            ballRow.appendChild(sep2);
            tk.blue.forEach(n => {
                const b = document.createElement('span');
                b.className = 'ls-wball blue';
                b.textContent = String(n).padStart(2, '0');
                ballRow.appendChild(b);
            });
            ticketDiv.appendChild(ballRow);
        } else {
            // 单式 / 复式固定展示
            ticketDiv.innerHTML = '<span>' + (tk.isMultiple ? '本次复式守号：' : '本次守号：') + '</span>';
            const ballRow = document.createElement('div');
            ballRow.className = 'ls-winning-ticket';
            ballRow.style.marginTop = '6px';
            tk.red.forEach(n => {
                const b = document.createElement('span');
                b.className = 'ls-wball red';
                b.textContent = String(n).padStart(2, '0');
                ballRow.appendChild(b);
            });
            const sep = document.createElement('span');
            sep.style.cssText = 'color:#444;font-size:.8rem;';
            sep.textContent = '＋';
            ballRow.appendChild(sep);
            const blueNums = Array.isArray(tk.blue) ? tk.blue : [tk.blue];
            blueNums.forEach(n => {
                const bb = document.createElement('span');
                bb.className = 'ls-wball blue';
                bb.textContent = String(n).padStart(2, '0');
                ballRow.appendChild(bb);
            });
            ticketDiv.appendChild(ballRow);
        }
        container.appendChild(ticketDiv);
    }

    // ── 灵魂评语 ──
    const commentDiv = document.createElement('div');
    commentDiv.className = 'ls-comment';
    const commentText = document.createElement('p');
    commentText.className = 'ls-comment-text';
    commentText.textContent = comment;
    commentDiv.appendChild(commentText);
    container.appendChild(commentDiv);

    // ── 再来一次 ──
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'ls-retry-btn';
    retryBtn.textContent = '↺  重新配置，再赌一次人生';
    retryBtn.dataset.lsAction = 'retry';
    container.appendChild(retryBtn);

    return container;
}

/* ── 启动模拟 ── */
function startLifeSim() {
    const st = lifeSimState;
    const err = lsValidate(st);
    if (err) {
        st.error = err;
        renderLifeSimPage();
        return;
    }
    st.error = '';

    // 构建 Worker 配置数据
    const cfg = {
        betType: st.betType,
        pickMode: st.pickMode,
        singlePerPeriod: st.singlePerPeriod,
        multipleRedCount: st.multipleRedCount,
        multipleBlueCount: st.multipleBlueCount,
        groupsPerPeriod: st.groupsPerPeriod || 1,
        fixedRedArr: [],
        fixedBlue: 0,
        fixedMultipleRedArr: [],
        fixedMultipleBlueArr: [],
        danRedArr: [],
        tuoRedArr: [],
        danTuoBlueArr: [],
    };

    // 机选补齐 / 整理固定号码
    if (st.betType === 'single' && st.pickMode === 'fixed') {
        const neededRed = 6 - st.fixedRed.size;
        const extraRed = neededRed > 0 ? drawRemaining(33, [...st.fixedRed], neededRed) : [];
        cfg.fixedRedArr = sortAsc([...st.fixedRed, ...extraRed]);
        cfg.fixedBlue = st.fixedBlue || (Math.floor(Math.random() * 16) + 1);
        st.resolvedFixedTicket = { red: cfg.fixedRedArr, blue: cfg.fixedBlue };
    } else if (st.betType === 'multiple' && st.pickMode === 'fixed') {
        // 用目标数量补齐（用户自选球 + 机选补满至 targetRed/Blue）
        const selRed = [...st.fixedMultipleRed];
        const selBlue = [...st.fixedMultipleBlue];
        const tRed = st.fixedMultipleTargetRed || 9;
        const tBlue = st.fixedMultipleTargetBlue || 1;
        const extraRed = tRed > selRed.length ? drawRemaining(33, selRed, tRed - selRed.length) : [];
        const extraBlue = tBlue > selBlue.length ? drawRemaining(16, selBlue, tBlue - selBlue.length) : [];
        cfg.fixedMultipleRedArr = sortAsc([...selRed, ...extraRed].slice(0, tRed));
        cfg.fixedMultipleBlueArr = sortAsc([...selBlue, ...extraBlue].slice(0, tBlue));
        cfg.multipleRedCount = cfg.fixedMultipleRedArr.length;
        cfg.multipleBlueCount = cfg.fixedMultipleBlueArr.length;
        st.resolvedFixedTicket = { red: cfg.fixedMultipleRedArr, blue: cfg.fixedMultipleBlueArr, isMultiple: true };
    } else if (st.betType === 'danTuo') {
        cfg.danRedArr = sortAsc([...st.danRed]);
        cfg.tuoRedArr = sortAsc([...st.tuoRed]);
        cfg.danTuoBlueArr = sortAsc([...st.danTuoBlue]);
        st.resolvedFixedTicket = { dan: cfg.danRedArr, tuo: cfg.tuoRedArr, blue: cfg.danTuoBlueArr, isDanTuo: true };
    }

    // 清理旧 worker
    if (lifeSimWorker) { lifeSimWorker.terminate(); lifeSimWorker = null; }

    // 创建 Blob URL Worker
    const blob = new Blob([LIFE_SIM_WORKER_SRC], { type: 'text/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    lifeSimWorker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);

    lifeSimWorker.onmessage = function(e) {
        const data = e.data;
        if (data.type === 'progress') {
            // 增量更新：直接修改 DOM 避免整体重渲
            lifeSimState.currentPeriods = data.totalPeriods;
            const yearEl = document.getElementById('lsYearNumber');
            const periodEl = document.getElementById('lsPeriodCounter');
            if (yearEl) yearEl.textContent = fmtNum(Math.floor(data.totalPeriods / 156));
            if (periodEl) periodEl.textContent = '已开奖 ' + fmtNum(data.totalPeriods) + ' 期';
        } else if (data.type === 'done') {
            lifeSimWorker.terminate();
            lifeSimWorker = null;
            lifeSimState.status = 'done';
            lifeSimState.result = data;
            renderLifeSimPage();
        }
    };

    lifeSimWorker.onerror = function(err) {
        lifeSimState.status = 'idle';
        lifeSimState.error = 'Worker 发生错误：' + err.message;
        renderLifeSimPage();
    };

    st.status = 'running';
    st.currentPeriods = 0;
    renderLifeSimPage();
    lifeSimWorker.postMessage(cfg);
}

/* ── life-sim 路由已在上方的 openSubpage 中直接处理 ── */

/* ── 事件委托：life-sim 专用 ── */
subpageContent.addEventListener('click', function(e) {
    if (!lifeSimState) return;

    const action = e.target.dataset.lsAction || (e.target.closest('[data-ls-action]') || {}).dataset?.lsAction;
    if (!action) return;

    const el = e.target.dataset.lsAction ? e.target : e.target.closest('[data-ls-action]');

    if (action === 'bet-type') {
        if (lifeSimState.status === 'running') return;
        lifeSimState.betType = el.dataset.lsVal;
        lifeSimState.error = '';
        renderLifeSimPage();
    } else if (action === 'pick-mode') {
        if (lifeSimState.status === 'running') return;
        lifeSimState.pickMode = el.dataset.lsVal;
        lifeSimState.error = '';
        renderLifeSimPage();
    } else if (action === 'pick-red') {
        if (lifeSimState.status === 'running') return;
        const n = parseInt(el.dataset.lsNum, 10);
        if (lifeSimState.fixedRed.has(n)) {
            lifeSimState.fixedRed.delete(n);
        } else if (lifeSimState.fixedRed.size < 6) {
            lifeSimState.fixedRed.add(n);
        }
        renderLifeSimPage();
    } else if (action === 'pick-blue') {
        if (lifeSimState.status === 'running') return;
        const n = parseInt(el.dataset.lsNum, 10);
        lifeSimState.fixedBlue = lifeSimState.fixedBlue === n ? 0 : n;
        renderLifeSimPage();
    } else if (action === 'pick-multiple-red') {
        if (lifeSimState.status === 'running') return;
        const n = parseInt(el.dataset.lsNum, 10);
        if (lifeSimState.fixedMultipleRed.has(n)) lifeSimState.fixedMultipleRed.delete(n);
        else if (lifeSimState.fixedMultipleRed.size < lifeSimState.fixedMultipleTargetRed) lifeSimState.fixedMultipleRed.add(n);
        renderLifeSimPage();
    } else if (action === 'pick-multiple-blue') {
        if (lifeSimState.status === 'running') return;
        const n = parseInt(el.dataset.lsNum, 10);
        if (lifeSimState.fixedMultipleBlue.has(n)) lifeSimState.fixedMultipleBlue.delete(n);
        else if (lifeSimState.fixedMultipleBlue.size < lifeSimState.fixedMultipleTargetBlue) lifeSimState.fixedMultipleBlue.add(n);
        renderLifeSimPage();
    } else if (action === 'pick-dantuo-red') {
        if (lifeSimState.status === 'running') return;
        const n = parseInt(el.dataset.lsNum, 10);
        const inDan = lifeSimState.danRed.has(n);
        const inTuo = lifeSimState.tuoRed.has(n);
        if (inDan) {
            // 胆 → 拖
            lifeSimState.danRed.delete(n);
            lifeSimState.tuoRed.add(n);
        } else if (inTuo) {
            // 拖 → 取消
            lifeSimState.tuoRed.delete(n);
        } else {
            // 未选 → 胆（胆满则直接设为拖）
            if (lifeSimState.danRed.size < 5) lifeSimState.danRed.add(n);
            else lifeSimState.tuoRed.add(n);
        }
        renderLifeSimPage();
    } else if (action === 'pick-dantuo-blue') {
        if (lifeSimState.status === 'running') return;
        const n = parseInt(el.dataset.lsNum, 10);
        if (lifeSimState.danTuoBlue.has(n)) lifeSimState.danTuoBlue.delete(n);
        else lifeSimState.danTuoBlue.add(n);
        renderLifeSimPage();
    } else if (action === 'start') {
        if (lifeSimState.status === 'running') return;
        startLifeSim();
    } else if (action === 'retry') {
        if (lifeSimWorker) { lifeSimWorker.terminate(); lifeSimWorker = null; }
        lifeSimState.status = 'idle';
        lifeSimState.result = null;
        lifeSimState.error = '';
        lifeSimState.currentPeriods = 0;
        lifeSimState.resolvedFixedTicket = null;
        renderLifeSimPage();
    }
}, true); // 使用捕获阶段，避免与现有冒泡监听器冲突

/* 监听 life-sim 数字输入框变化 */
subpageContent.addEventListener('change', function(e) {
    if (!lifeSimState || lifeSimState.status === 'running') return;
    const field = e.target.dataset.lsField;
    if (!field) return;
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    if (field === 'singlePerPeriod') lifeSimState.singlePerPeriod = Math.min(10000, Math.max(1, val));
    else if (field === 'multipleRedCount') lifeSimState.multipleRedCount = Math.min(33, Math.max(6, val));
    else if (field === 'multipleBlueCount') lifeSimState.multipleBlueCount = Math.min(16, Math.max(1, val));
    else if (field === 'fixedMultipleTargetRed') {
        lifeSimState.fixedMultipleTargetRed = Math.min(33, Math.max(6, val));
        // 超出目标数量的已选球自动移除
        if (lifeSimState.fixedMultipleRed.size > lifeSimState.fixedMultipleTargetRed) {
            const arr = sortAsc([...lifeSimState.fixedMultipleRed]).slice(0, lifeSimState.fixedMultipleTargetRed);
            lifeSimState.fixedMultipleRed = new Set(arr);
        }
    }
    else if (field === 'fixedMultipleTargetBlue') {
        lifeSimState.fixedMultipleTargetBlue = Math.min(16, Math.max(1, val));
        if (lifeSimState.fixedMultipleBlue.size > lifeSimState.fixedMultipleTargetBlue) {
            const arr = sortAsc([...lifeSimState.fixedMultipleBlue]).slice(0, lifeSimState.fixedMultipleTargetBlue);
            lifeSimState.fixedMultipleBlue = new Set(arr);
        }
    }
    else if (field === 'groupsPerPeriod') lifeSimState.groupsPerPeriod = Math.min(1000, Math.max(1, val));
    lifeSimState.error = '';
    renderLifeSimPage();
}, true);

/* ══════════════════════════════════════════════════════════════
   错过100万了吗 —— 历史开奖对比器
   数据层已迁移至 LotteryDB 单例模块，本节仅保留业务逻辑
   ══════════════════════════════════════════════════════════════ */

/* ── 奖级判断 ── */
function getSsqPrize(redHit, blueHit) {
    if (redHit === 6 && blueHit === 1) return { level: 1, label: '一等奖', reward: '约500万' };
    if (redHit === 6 && blueHit === 0) return { level: 2, label: '二等奖', reward: '约50万' };
    if (redHit === 5 && blueHit === 1) return { level: 3, label: '三等奖', reward: '3000元' };
    if ((redHit === 5 && blueHit === 0) || (redHit === 4 && blueHit === 1)) return { level: 4, label: '四等奖', reward: '200元' };
    if ((redHit === 4 && blueHit === 0) || (redHit === 3 && blueHit === 1)) return { level: 5, label: '五等奖', reward: '10元' };
    if (blueHit === 1) return { level: 6, label: '六等奖', reward: '5元' };
    return null;
}

function getDltPrize(frontHit, backHit) {
    if (frontHit === 5 && backHit === 2) return { level: 1, label: '一等奖', reward: '约500万' };
    if (frontHit === 5 && backHit === 1) return { level: 2, label: '二等奖', reward: '约50万' };
    if (frontHit === 5 && backHit === 0) return { level: 3, label: '三等奖', reward: '1万元' };
    if (frontHit === 4 && backHit === 2) return { level: 4, label: '四等奖', reward: '3000元' };
    if ((frontHit === 4 && backHit === 1) || (frontHit === 3 && backHit === 2)) return { level: 5, label: '五等奖', reward: '300元' };
    if ((frontHit === 4 && backHit === 0) || (frontHit === 3 && backHit === 1) || (frontHit === 2 && backHit === 2)) return { level: 6, label: '六等奖', reward: '100-200元' };
    if ((frontHit === 3 && backHit === 0) || (frontHit === 2 && backHit === 1) || (frontHit === 1 && backHit === 2) || (frontHit === 0 && backHit === 2)) return { level: 7, label: '七等奖', reward: '15元' };
    return null;
}

/* ── 单期对比 ── */
function checkMissPeriod(st, draw) {
    const game = st.game;
    if (st.betType === 'danTuo') {
        const drawRedSet = new Set(draw.red);
        const allDanHit = [...st.danRed].every(n => drawRedSet.has(n));
        if (!allDanHit) {
            const redHit = draw.red.filter(n => st.danRed.has(n) || st.tuoRed.has(n)).length;
            const blueHit = draw.blue.filter(n => st.danTuoBlue.has(n)).length;
            return { prize: null, redHit, blueHit };
        }
        const nonDanDrawReds = draw.red.filter(n => !st.danRed.has(n));
        const redHit = st.danRed.size + nonDanDrawReds.filter(n => st.tuoRed.has(n)).length;
        const blueHit = draw.blue.filter(n => st.danTuoBlue.has(n)).length;
        const prize = game === 'ssq' ? getSsqPrize(redHit, blueHit) : getDltPrize(redHit, blueHit);
        return { prize, redHit, blueHit };
    }
    const userRed  = st.betType === 'single' ? st.singleRed  : st.multipleRed;
    const userBlue = st.betType === 'single' ? st.singleBlue : st.multipleBlue;
    const redHit  = draw.red.filter(n => userRed.has(n)).length;
    const blueHit = draw.blue.filter(n => userBlue.has(n)).length;
    const prize = game === 'ssq' ? getSsqPrize(redHit, blueHit) : getDltPrize(redHit, blueHit);
    return { prize, redHit, blueHit };
}

/* ── 抓取历史开奖：优先读 LotteryDB 缓存，无则触发后台刷新 ── */
async function fetchDrawHistory(game) {
    const cached = LotteryDB.getDraws(game);
    if (cached.length > 0) return cached;
    await LotteryDB.refresh(game);
    const fresh = LotteryDB.getDraws(game);
    if (fresh.length === 0) throw Object.assign(new Error('获取开奖数据失败'), { type: 'NETWORK' });
    return fresh;
}

/* ── 状态工厂 ── */
function createMissState(game) {
    return {
        game,
        betType: 'single',
        singleRed:    new Set(),
        singleBlue:   new Set(),
        multipleRed:  new Set(),
        multipleBlue: new Set(),
        danRed:       new Set(),
        tuoRed:       new Set(),
        danTuoBlue:   new Set(),
        step: 'select',
        draws: [],
        matchResults: [],
        errorMsg: ''
    };
}

/* ── 球点击处理 ── */
function handleMissBallPick(btn) {
    const st = missState;
    const group = btn.dataset.missGroup;
    const num   = Number(btn.dataset.missNum);
    const config = LOTTERY_CONFIG[st.game];

    if (group === 'danTuoRed') {
        if (st.danRed.has(num)) {
            st.danRed.delete(num);
            st.tuoRed.add(num);
        } else if (st.tuoRed.has(num)) {
            st.tuoRed.delete(num);
        } else {
            if (st.danRed.size < config.redCount - 1) st.danRed.add(num);
        }
    } else {
        const setMap = {
            singleRed:   st.singleRed,
            singleBlue:  st.singleBlue,
            multipleRed: st.multipleRed,
            multipleBlue:st.multipleBlue,
            danTuoBlue:  st.danTuoBlue
        };
        const limits = {
            singleRed:    config.redCount,
            singleBlue:   config.blueCount,
            multipleRed:  config.redMax,
            multipleBlue: config.blueMax,
            danTuoBlue:   config.blueMax
        };
        const set = setMap[group];
        if (!set) return;
        if (set.has(num)) {
            set.delete(num);
        } else if (set.size < limits[group]) {
            set.add(num);
        }
    }
    renderMissPage();
}

/* ── 验证选号 ── */
function validateMissSelection(st) {
    const config = LOTTERY_CONFIG[st.game];
    const blueName = st.game === 'ssq' ? '蓝球' : '后区号';
    if (st.betType === 'single') {
        if (st.singleRed.size  < config.redCount)  return `还需选 ${config.redCount  - st.singleRed.size}  个红球`;
        if (st.singleBlue.size < config.blueCount) return `还需选 ${config.blueCount - st.singleBlue.size} 个${blueName}`;
        return null;
    }
    if (st.betType === 'multiple') {
        if (st.multipleRed.size  <= config.redCount)  return `复式红球需选 ${config.redCount + 1} 个或以上（当前 ${st.multipleRed.size} 个）`;
        if (st.multipleBlue.size <  config.blueCount) return `至少选 ${config.blueCount} 个${blueName}`;
        return null;
    }
    if (st.betType === 'danTuo') {
        if (st.danRed.size === 0) return '胆码至少选 1 个';
        if (st.tuoRed.size === 0) return '拖码至少选 1 个';
        if (st.danRed.size + st.tuoRed.size <= config.redCount) return `胆码+拖码合计需超过 ${config.redCount} 个（当前 ${st.danRed.size + st.tuoRed.size} 个）`;
        if (st.danTuoBlue.size < config.blueCount) return `还需选 ${config.blueCount - st.danTuoBlue.size} 个${blueName}`;
        return null;
    }
    return null;
}

/* ── 触发对比流程 ── */
async function handleMissStart() {
    const st = missState;
    /* LotteryDB 已有缓存时直接出结果，无需 loading 等待 */
    const cached = LotteryDB.getDraws(st.game);
    if (cached.length > 0) {
        st.draws = cached;
        st.matchResults = cached.map(draw => ({ draw, ...checkMissPeriod(st, draw) }));
        st.step = 'result';
        renderMissPage();
        return;
    }
    /* 无缓存：显示 loading 并后台拉取 */
    st.step = 'loading';
    renderMissPage();
    try {
        await LotteryDB.refresh(st.game);
        const draws = LotteryDB.getDraws(st.game);
        if (draws.length === 0) throw new Error('无数据');
        st.draws = draws;
        st.matchResults = draws.map(draw => ({ draw, ...checkMissPeriod(st, draw) }));
        st.step = 'result';
    } catch (_) {
        st.errorMsg = '获取开奖数据失败（已尝试直连及两个代理），请检查网络后重试。';
        st.step = 'error';
    }
    renderMissPage();
}

/* ── 主渲染入口 ── */
function renderMissPage() {
    subpageContent.innerHTML = '';
    if (!missState) return;
    let node;
    switch (missState.step) {
        case 'select':  node = buildMissSelectUI();  break;
        case 'loading': node = buildMissLoadingUI(); break;
        case 'result':  node = buildMissResultUI();  break;
        case 'error':   node = buildMissErrorUI();   break;
        default: return;
    }
    subpageContent.appendChild(node);
}

/* ── 球选择器（单选/复选） ── */
function buildMissBallPicker(colorClass, labelText, max, selectedSet, limit, groupName) {
    const wrap = document.createElement('div');
    wrap.className = 'ls-ball-picker';
    const lbl = document.createElement('p');
    lbl.className = 'ls-ball-picker-title';
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    const grid = document.createElement('div');
    grid.className = 'ls-ball-grid';
    for (let i = 1; i <= max; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive   = selectedSet.has(i);
        const isAtLimit  = !isActive && selectedSet.size >= limit;
        btn.className = 'ls-ball ' + colorClass + (isActive ? ' active' : '') + (isAtLimit ? ' miss-blocked' : '');
        btn.textContent  = String(i).padStart(2, '0');
        btn.dataset.missBall  = '1';
        btn.dataset.missGroup = groupName;
        btn.dataset.missNum   = i;
        btn.disabled = isAtLimit;
        grid.appendChild(btn);
    }
    wrap.appendChild(grid);
    return wrap;
}

/* ── 胆拖红球三态选择器 ── */
function buildMissDanTuoRedPicker() {
    const st = missState;
    const config = LOTTERY_CONFIG[st.game];
    const wrap = document.createElement('div');
    wrap.className = 'ls-ball-picker';
    const lbl = document.createElement('p');
    lbl.className = 'ls-ball-picker-title';
    lbl.innerHTML = `点一次 = <b style="color:#c07000">胆码</b>，再点 = <b style="color:#3060cc">拖码</b>，再点取消&ensp;·&ensp;胆 <b>${st.danRed.size}</b> 个&ensp;拖 <b>${st.tuoRed.size}</b> 个`;
    wrap.appendChild(lbl);
    const grid = document.createElement('div');
    grid.className = 'ls-ball-grid';
    for (let i = 1; i <= config.redMax; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isDan = st.danRed.has(i);
        const isTuo = st.tuoRed.has(i);
        btn.className = 'ls-ball red-ball' + (isDan ? ' ls-dan' : isTuo ? ' ls-tuo' : '');
        btn.textContent = String(i).padStart(2, '0');
        btn.dataset.missBall  = '1';
        btn.dataset.missGroup = 'danTuoRed';
        btn.dataset.missNum   = i;
        btn.title = isDan ? '胆码（再点→拖码）' : isTuo ? '拖码（再点→取消）' : '点击设为胆码';
        grid.appendChild(btn);
    }
    wrap.appendChild(grid);
    const hint = document.createElement('p');
    hint.className = 'ls-number-hint';
    hint.style.marginTop = '8px';
    hint.textContent = '胆码必须全部出现在开奖号里；拖码覆盖剩余球位。';
    wrap.appendChild(hint);
    return wrap;
}

/* ── 选号界面 ── */
function buildMissSelectUI() {
    const st = missState;
    const config = LOTTERY_CONFIG[st.game];
    const wrap = document.createElement('div');
    wrap.className = 'miss-select';

    // 游戏切换
    const gameTabsDiv = document.createElement('div');
    gameTabsDiv.className = 'miss-tabs';
    [['ssq', '双色球'], ['dlt', '大乐透']].forEach(([g, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'miss-tab' + (st.game === g ? ' active' : '');
        btn.textContent = label;
        btn.dataset.missAction = 'switch-game';
        btn.dataset.missGame = g;
        gameTabsDiv.appendChild(btn);
    });
    wrap.appendChild(gameTabsDiv);

    // 玩法切换
    const betTabsDiv = document.createElement('div');
    betTabsDiv.className = 'miss-tabs';
    [['single', '单式'], ['multiple', '复式'], ['danTuo', '胆拖']].forEach(([type, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'miss-tab' + (st.betType === type ? ' active' : '');
        btn.textContent = label;
        btn.dataset.missAction = 'switch-bet';
        btn.dataset.missBet = type;
        betTabsDiv.appendChild(btn);
    });
    wrap.appendChild(betTabsDiv);

    // 选球区
    const configArea = document.createElement('div');
    configArea.className = 'ls-config-area';
    const blueName = st.game === 'ssq' ? '蓝球' : '后区号';

    if (st.betType === 'single') {
        configArea.appendChild(buildMissBallPicker('red-ball',
            `选红球（恰好 ${config.redCount} 个，已选 ${st.singleRed.size} 个）`,
            config.redMax, st.singleRed, config.redCount, 'singleRed'));
        configArea.appendChild(buildMissBallPicker('blue-ball',
            `选${blueName}（${config.blueCount} 个）`,
            config.blueMax, st.singleBlue, config.blueCount, 'singleBlue'));
    } else if (st.betType === 'multiple') {
        configArea.appendChild(buildMissBallPicker('red-ball',
            `选红球（至少 ${config.redCount + 1} 个，已选 ${st.multipleRed.size} 个）`,
            config.redMax, st.multipleRed, config.redMax, 'multipleRed'));
        configArea.appendChild(buildMissBallPicker('blue-ball',
            `选${blueName}（至少 ${config.blueCount} 个，已选 ${st.multipleBlue.size} 个）`,
            config.blueMax, st.multipleBlue, config.blueMax, 'multipleBlue'));
    } else {
        configArea.appendChild(buildMissDanTuoRedPicker());
        configArea.appendChild(buildMissBallPicker('blue-ball',
            `选${blueName}（至少 ${config.blueCount} 个）`,
            config.blueMax, st.danTuoBlue, config.blueMax, 'danTuoBlue'));
    }
    wrap.appendChild(configArea);

    // 验证提示
    const validErr = validateMissSelection(st);
    if (validErr) {
        const hint = document.createElement('p');
        hint.className = 'miss-hint';
        hint.textContent = '⚠ ' + validErr;
        wrap.appendChild(hint);
    }

    // 开始按钮
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'ls-start-btn';
    startBtn.textContent = '开始对比最近100期开奖';
    startBtn.dataset.missAction = 'start';
    if (validErr) startBtn.disabled = true;
    wrap.appendChild(startBtn);

    return wrap;
}

/* ── 加载中界面 ── */
function buildMissLoadingUI() {
    const div = document.createElement('div');
    div.className = 'miss-loading';
    const spinner = document.createElement('div');
    spinner.className = 'miss-spinner';
    div.appendChild(spinner);
    const text = document.createElement('p');
    text.className = 'miss-loading-text';
    text.textContent = '正在获取最近100期开奖数据…';
    div.appendChild(text);
    return div;
}

/* ── 错误界面 ── */
function buildMissErrorUI() {
    const st = missState;
    const wrap = document.createElement('div');
    wrap.className = 'miss-error';

    const icon = document.createElement('div');
    icon.className = 'miss-error-icon';
    icon.textContent = '⚠️';
    wrap.appendChild(icon);

    const msg = document.createElement('p');
    msg.className = 'miss-error-msg';
    msg.textContent = st.errorMsg;
    wrap.appendChild(msg);

    const tip = document.createElement('p');
    tip.className = 'miss-error-tip';
    tip.textContent = '已自动尝试直连及两个 CORS 代理均失败。请检查网络连接，或改用 VS Code Live Server 打开本页面后重试。';
    wrap.appendChild(tip);

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'ls-start-btn';
    retryBtn.style.marginBottom = '10px';
    retryBtn.textContent = '重新获取';
    retryBtn.dataset.missAction = 'retry';
    wrap.appendChild(retryBtn);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'ls-retry-btn';
    resetBtn.textContent = '重新选号';
    resetBtn.dataset.missAction = 'reset';
    wrap.appendChild(resetBtn);

    return wrap;
}

/* ── 辅助：近似奖金总计 ── */
function calcApproxWin(winResults) {
    const APPROX = { 1: 5000000, 2: 500000, 3: 3000, 4: 200, 5: 10, 6: 5, 7: 15 };
    const total = winResults.reduce((s, r) => s + (APPROX[r.prize.level] || 0), 0);
    if (total >= 10000) return Math.round(total / 10000) + ' 万元';
    return total + ' 元';
}

/* ── 单期行渲染 ── */
function buildMissPeriodRow(result, st) {
    const { draw, prize, redHit, blueHit } = result;
    const row = document.createElement('div');
    row.className = 'miss-period-row';

    const info = document.createElement('div');
    info.className = 'miss-period-info';
    const codeSpan = document.createElement('span');
    codeSpan.className = 'miss-period-code';
    codeSpan.textContent = '第 ' + draw.code + ' 期';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'miss-period-date';
    dateSpan.textContent = draw.date;
    info.appendChild(codeSpan);
    info.appendChild(dateSpan);
    row.appendChild(info);

    // 开奖号（命中高亮）
    const ballsDiv = document.createElement('div');
    ballsDiv.className = 'miss-period-balls';

    const userRed  = st.betType === 'danTuo'
        ? new Set([...st.danRed, ...st.tuoRed])
        : (st.betType === 'single' ? st.singleRed : st.multipleRed);
    const userBlue = st.betType === 'danTuo' ? st.danTuoBlue
        : (st.betType === 'single' ? st.singleBlue : st.multipleBlue);

    draw.red.forEach(n => {
        const b = document.createElement('span');
        b.className = 'miss-ball red' + (userRed.has(n) ? ' hit' : '');
        b.textContent = String(n).padStart(2, '0');
        ballsDiv.appendChild(b);
    });
    const sep = document.createElement('span');
    sep.className = 'miss-ball-sep';
    sep.textContent = '+';
    ballsDiv.appendChild(sep);
    draw.blue.forEach(n => {
        const b = document.createElement('span');
        b.className = 'miss-ball blue' + (userBlue.has(n) ? ' hit' : '');
        b.textContent = String(n).padStart(2, '0');
        ballsDiv.appendChild(b);
    });
    row.appendChild(ballsDiv);

    const badge = document.createElement('span');
    badge.className = 'miss-prize-badge level-' + prize.level;
    badge.textContent = prize.label;
    row.appendChild(badge);

    return row;
}

/* ── 结果界面 ── */
function buildMissResultUI() {
    const st = missState;
    const config = LOTTERY_CONFIG[st.game];

    const winResults = st.matchResults.filter(r => r.prize !== null);
    const totalPeriods = st.matchResults.length;
    const totalWins = winResults.length;

    // 最高奖级
    let bestLevel = 0, bestPrizeLabel = '无', bestCount = 0;
    if (winResults.length > 0) {
        bestLevel = Math.min(...winResults.map(r => r.prize.level));
        bestPrizeLabel = winResults.find(r => r.prize.level === bestLevel).prize.label;
        bestCount = winResults.filter(r => r.prize.level === bestLevel).length;
    }

    // 最接近一等奖（最小差球数）
    const maxRed = config.redCount, maxBlue = config.blueCount;
    let minDist = maxRed + maxBlue;
    st.matchResults.forEach(r => {
        const dist = (maxRed - r.redHit) + (maxBlue - r.blueHit);
        if (dist < minDist) minDist = dist;
    });
    const closestDesc = minDist === 0 ? '完全命中！' : `差 ${minDist} 个球`;

    const betLabels = { single: '单式', multiple: '复式', danTuo: '胆拖' };

    const wrap = document.createElement('div');
    wrap.className = 'ls-result-done';

    // Banner
    const banner = document.createElement('div');
    banner.className = 'ls-result-banner';
    const emoji = totalWins > 0 ? (bestLevel <= 2 ? '🤯' : '😱') : '😔';
    const bannerTitle = totalWins > 0
        ? `最近 ${totalPeriods} 期，你错过了 ${totalWins} 个奖！`
        : `最近 ${totalPeriods} 期全军覆没`;
    banner.innerHTML = `<div class="ls-result-banner-emoji">${emoji}</div>
        <div class="ls-result-banner-title">${bannerTitle}</div>
        <div class="ls-result-banner-sub">${config.name} · ${betLabels[st.betType]}</div>`;
    wrap.appendChild(banner);

    // 汇总卡片
    const grid = document.createElement('div');
    grid.className = 'ls-result-grid';
    const approxMonths = Math.round(totalPeriods / (st.game === 'ssq' ? 3 : 2));
    const cardData = [
        { label: '对比期数', main: totalPeriods + ' 期', color: 'cyan', sub: `约 ${approxMonths} 个月` },
        { label: '最高错过', main: bestLevel > 0 ? bestPrizeLabel : '无',
          color: bestLevel <= 2 ? 'red' : bestLevel <= 4 ? 'yellow' : 'green',
          sub: bestLevel > 0 ? `共 ${bestCount} 次` : '没错过任何奖' },
        { label: '最接近一等奖', main: closestDesc, color: 'yellow',
          sub: `命中 ${maxRed + maxBlue - minDist}/${maxRed + maxBlue} 球` },
        { label: '总中奖次数', main: totalWins + ' 次',
          color: totalWins > 0 ? 'green' : '',
          sub: totalWins > 0 ? '参考奖金约 ' + calcApproxWin(winResults) : '颗粒无收' }
    ];
    cardData.forEach(c => {
        const card = document.createElement('div');
        card.className = 'ls-result-card';
        card.innerHTML = `<div class="ls-result-card-label">${c.label}</div>
            <div class="ls-result-card-main ${c.color}">${c.main}</div>
            <div class="ls-result-card-sub">${c.sub}</div>`;
        grid.appendChild(card);
    });
    wrap.appendChild(grid);

    // 奖级汇总表
    if (winResults.length > 0) {
        const prizeMap = {};
        winResults.forEach(r => {
            const k = r.prize.level;
            if (!prizeMap[k]) prizeMap[k] = { ...r.prize, count: 0 };
            prizeMap[k].count++;
        });

        const tableWrap = document.createElement('div');
        tableWrap.className = 'miss-table-wrap';
        const tableTitle = document.createElement('p');
        tableTitle.className = 'miss-section-title';
        tableTitle.textContent = '奖级明细';
        tableWrap.appendChild(tableTitle);

        const table = document.createElement('table');
        table.className = 'miss-table';
        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>奖级</th><th>次数</th><th>参考奖金</th></tr>';
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        Object.values(prizeMap).sort((a, b) => a.level - b.level).forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><span class="miss-prize-badge level-${p.level}">${p.label}</span></td>
                <td><b>${p.count}</b> 次</td><td>${p.reward}</td>`;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        wrap.appendChild(tableWrap);
    }

    // 中奖期次详情
    if (winResults.length > 0) {
        const detailWrap = document.createElement('div');
        detailWrap.className = 'miss-detail-wrap';
        const detailTitle = document.createElement('p');
        detailTitle.className = 'miss-section-title';
        detailTitle.textContent = `中奖期次（${winResults.length} 期，高亮=命中）`;
        detailWrap.appendChild(detailTitle);

        const SHOW_MAX = 20;
        winResults.slice(0, SHOW_MAX).forEach(r => detailWrap.appendChild(buildMissPeriodRow(r, st)));

        if (winResults.length > SHOW_MAX) {
            const more = document.createElement('p');
            more.className = 'miss-more-note';
            more.textContent = `…还有 ${winResults.length - SHOW_MAX} 期中奖未显示`;
            detailWrap.appendChild(more);
        }
        wrap.appendChild(detailWrap);
    }

    // 重新选号
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'ls-retry-btn';
    resetBtn.textContent = '重新选号';
    resetBtn.dataset.missAction = 'reset';
    wrap.appendChild(resetBtn);

    return wrap;
}

/* ── 页面加载后启动 LotteryDB 后台同步 ── */
LotteryDB.init();

/* ═══════════════════════════════════════════════════════
   快乐8 专用页面渲染
   ═══════════════════════════════════════════════════════ */

const K8_SELECT_NAMES = ['选一','选二','选三','选四','选五','选六','选七','选八','选九','选十'];

/* 快乐8奖级表 */
const K8_PRIZE_TABLE = {
    1:  { 1:  { label:'选一中一',  reward:'4.5元' } },
    2:  { 2:  { label:'选二中二',  reward:'19元'  } },
    3:  { 3:  { label:'选三中三',  reward:'52元'  },
          2:  { label:'选三中二',  reward:'3元'   } },
    4:  { 4:  { label:'选四中四',  reward:'93元'  },
          3:  { label:'选四中三',  reward:'5元'   },
          2:  { label:'选四中二',  reward:'3元'   } },
    5:  { 5:  { label:'选五中五',  reward:'1000元'},
          4:  { label:'选五中四',  reward:'20元'  },
          3:  { label:'选五中三',  reward:'3元'   } },
    6:  { 6:  { label:'选六中六',  reward:'2880元'},
          5:  { label:'选六中五',  reward:'30元'  },
          4:  { label:'选六中四',  reward:'10元'  },
          3:  { label:'选六中三',  reward:'3元'   } },
    7:  { 7:  { label:'选七中七',  reward:'8500元'},
          6:  { label:'选七中六',  reward:'300元' },
          5:  { label:'选七中五',  reward:'30元'  },
          4:  { label:'选七中四',  reward:'4元'   },
          0:  { label:'选七全不中',reward:'2元'   } },
    8:  { 8:  { label:'选八中八',  reward:'50000元'},
          7:  { label:'选八中七',  reward:'800元' },
          6:  { label:'选八中六',  reward:'80元'  },
          5:  { label:'选八中五',  reward:'10元'  },
          4:  { label:'选八中四',  reward:'3元'   },
          0:  { label:'选八全不中',reward:'3元'   } },
    9:  { 9:  { label:'选九中九',  reward:'浮动奖'},
          8:  { label:'选九中八',  reward:'2000元'},
          7:  { label:'选九中七',  reward:'225元' },
          6:  { label:'选九中六',  reward:'22元'  },
          5:  { label:'选九中五',  reward:'5元'   },
          4:  { label:'选九中四',  reward:'3元'   },
          0:  { label:'选九全不中',reward:'3元'   } },
    10: { 10: { label:'选十中十',  reward:'浮动奖'},
          9:  { label:'选十中九',  reward:'8000元'},
          8:  { label:'选十中八',  reward:'720元' },
          7:  { label:'选十中七',  reward:'80元'  },
          6:  { label:'选十中六',  reward:'5元'   },
          0:  { label:'选十全不中',reward:'2元'   } }
};

function getK8Prize(selectMode, hitCount) {
    const table = K8_PRIZE_TABLE[selectMode];
    if (!table) return null;
    const entry = table[hitCount];
    if (!entry) return null;
    return { level: hitCount === 0 ? 99 : (selectMode - hitCount + 1), ...entry };
}

/* 渲染快乐8选法选项卡 */
function renderK8ModeTabs(currentMode) {
    const bar = document.createElement('div');
    bar.className = 'k8-mode-bar';
    for (let i = 1; i <= 10; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'k8-mode-tab' + (i === currentMode ? ' active' : '');
        btn.dataset.k8Mode = String(i);
        btn.textContent = K8_SELECT_NAMES[i - 1];
        bar.appendChild(btn);
    }
    return bar;
}

/* 快乐8页面主渲染（机选 isAutoMode=false / 自动选号 isAutoMode=true） */
function renderK8Page(isAutoMode) {
    if (!quickState) return;
    const st = quickState;
    const sc = st.k8SelectMode || 8;
    const config = LOTTERY_CONFIG['k8'];

    subpageContent.innerHTML = '';
    const builder = document.createElement('section');
    builder.className = 'quick-builder';

    // ── 自动模式：步骤1 – 生成杀号 ──
    if (isAutoMode && st.step === 'start') {
        const killGroupCount = getSelectorConfig()['k8']?.killGroupCount || 4;
        const card = document.createElement('div');
        card.className = 'auto-step-card';
        card.innerHTML = `
            <h3 class="auto-step-title">第一步：生成参考组</h3>
            <p class="auto-step-desc">
                系统将生成 ${killGroupCount} 组模拟快乐8摇号（每组从1-80中摇出20个号），
                用第 ${killGroupCount} 组结果作为"杀号"，从剩余号码池中为你生成最终号码。
            </p>
            <button class="auto-start-btn" data-action="k8-auto-start" type="button">开始生成参考组</button>`;
        builder.appendChild(card);
        subpageContent.appendChild(builder);
        return;
    }

    if (isAutoMode && st.step === 'kill') {
        const card = document.createElement('div');
        card.className = 'auto-step-card';
        const killGroupCount = getSelectorConfig()['k8']?.killGroupCount || 4;
        card.innerHTML = `<h3 class="auto-step-title">参考组已生成，杀号确认</h3>
            <p class="auto-step-desc">以下是自动生成的${killGroupCount}组模拟摇号结果，第${killGroupCount}组（标红）为杀号组，其号码将从后续球池中排除。</p>`;

        const groupsDiv = document.createElement('div');
        groupsDiv.className = 'auto-kill-groups';
        const total = st.killGroups.length;
        const needFold = total > 10;
        const expanded = st.k8GroupsExpanded || false;

        if (!needFold || expanded) {
            // 显示全部组
            st.killGroups.forEach((g, idx) => {
                const row = document.createElement('div');
                const isKill = idx === total - 1;
                row.className = `auto-kill-group-row${isKill ? ' is-kill' : ''}`;
                const labelText = isKill ? `第${total}组 ★` : `第${idx + 1}组　`;
                row.innerHTML = `<span class="auto-kill-label">${labelText}</span>${formatNums(sortAsc(g.red))}${isKill ? '　← 杀号组' : ''}`;
                groupsDiv.appendChild(row);
            });
            if (needFold) {
                const collapseBtn = document.createElement('button');
                collapseBtn.type = 'button';
                collapseBtn.className = 'k8-fold-btn';
                collapseBtn.dataset.action = 'k8-toggle-groups';
                collapseBtn.textContent = '▲ 收起中间参考组';
                groupsDiv.appendChild(collapseBtn);
            }
        } else {
            // 展示前 3 组
            for (let idx = 0; idx < 3; idx++) {
                const row = document.createElement('div');
                row.className = 'auto-kill-group-row';
                row.innerHTML = `<span class="auto-kill-label">第${idx + 1}组　</span>${formatNums(sortAsc(st.killGroups[idx].red))}`;
                groupsDiv.appendChild(row);
            }
            // 折叠提示
            const foldRow = document.createElement('div');
            foldRow.className = 'auto-kill-group-fold';
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'k8-fold-btn';
            toggleBtn.dataset.action = 'k8-toggle-groups';
            toggleBtn.textContent = `▼ 展开中间 ${total - 4} 组参考组`;
            foldRow.appendChild(toggleBtn);
            groupsDiv.appendChild(foldRow);
            // 展示最后一组（杀号组）
            const lastIdx = total - 1;
            const killRow = document.createElement('div');
            killRow.className = 'auto-kill-group-row is-kill';
            killRow.innerHTML = `<span class="auto-kill-label">第${total}组 ★</span>${formatNums(sortAsc(st.killGroups[lastIdx].red))}　← 杀号组`;
            groupsDiv.appendChild(killRow);
        }
        card.appendChild(groupsDiv);

        const summary = document.createElement('div');
        summary.className = 'killed-summary';
        summary.textContent = `已杀号码：${formatNums(sortAsc([...st.killedRed]))}`;
        card.appendChild(summary);

        const p = document.createElement('p');
        p.className = 'auto-step-desc';
        p.textContent = `已杀 ${st.killedRed.size} 个号，剩余 ${80 - st.killedRed.size} 个号可用。确认后从剩余球池进行选法配置。`;
        card.appendChild(p);

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'auto-confirm-btn';
        confirmBtn.dataset.action = 'k8-confirm-kill';
        confirmBtn.textContent = '确认杀号，配置选法';
        card.appendChild(confirmBtn);
        builder.appendChild(card);
        subpageContent.appendChild(builder);
        return;
    }

    // ── 选法选项卡 ──
    builder.appendChild(renderK8ModeTabs(sc));

    if (isAutoMode && st.killedRed.size > 0) {
        const killNote = document.createElement('div');
        killNote.className = 'auto-mode-note';
        killNote.textContent = `已杀号：${formatNums(sortAsc([...st.killedRed]))}　　剩余 ${80 - st.killedRed.size} 个号可用`;
        builder.appendChild(killNote);
    }

    // ── 玩法切换 ──
    const switcher = document.createElement('div');
    switcher.className = 'mode-switch';
    const modes = ['single', 'multiple', 'dantuo'];
    const modeLabels = { single: '单式', multiple: '复式', dantuo: '胆拖' };
    modes.forEach(m => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-tab' + (st.mode === m ? ' active' : '');
        btn.dataset.mode = m;
        if (m === 'dantuo' && sc < 2) btn.disabled = true;
        btn.textContent = modeLabels[m];
        switcher.appendChild(btn);
    });
    builder.appendChild(switcher);

    if (st.mode === 'single') {
        builder.appendChild(renderK8SinglePanel(sc));
    } else if (st.mode === 'multiple') {
        builder.appendChild(renderK8MultiplePanel(sc));
    } else {
        builder.appendChild(renderK8DantuoPanel(sc));
    }

    const actionBar = document.createElement('div');
    actionBar.className = 'actions-bar';
    actionBar.innerHTML = `<button class="generate-btn" data-action="generate-quick" type="button" ${st.generating ? 'disabled' : ''}>${st.generating ? '生成中...' : '开始生成'}</button>`;
    builder.appendChild(actionBar);

    if (st.error) {
        const err = document.createElement('div');
        err.className = 'error-banner';
        err.textContent = st.error;
        builder.appendChild(err);
    }

    subpageContent.appendChild(builder);

    // 结果
    const resultSection = document.createElement('section');
    resultSection.className = 'preview-card';
    resultSection.innerHTML = '<h3 class="preview-title">生成结果</h3>';
    resultSection.appendChild(renderK8Results(st.results, sc));
    subpageContent.appendChild(resultSection);
}

function renderK8SinglePanel(sc) {
    const wrapper = document.createElement('div');
    wrapper.className = 'config-card';
    wrapper.innerHTML = `
        <div class="form-grid">
            <label class="field-block">
                <span class="field-label">生成组数</span>
                <input class="field-input" data-field="generateCount" type="number" min="1" max="50" value="${quickState.form.generateCount}">
            </label>
        </div>
        <p class="helper-text">单式每组从可用号码池中随机选 <b>${sc}</b> 个号（${K8_SELECT_NAMES[sc-1]}）。</p>
    `;
    return wrapper;
}

function renderK8MultiplePanel(sc) {
    const total = quickState.form.multipleRedTotal;
    const ticketCount = combination(total, sc);
    const wrapper = document.createElement('div');
    wrapper.className = 'config-card';
    wrapper.innerHTML = `
        <div class="form-grid">
            <label class="field-block">
                <span class="field-label">生成组数</span>
                <input class="field-input" data-field="generateCount" type="number" min="1" max="50" value="${quickState.form.generateCount}">
            </label>
            <label class="field-block">
                <span class="field-label">复式号码数</span>
                <input class="field-input" data-field="multipleRedTotal" type="number" min="${sc + 1}" max="80" value="${total}">
            </label>
        </div>
        <p class="helper-text">从 ${total} 个号中取 ${sc} 个，每组产生 <b>${ticketCount}</b> 注（${K8_SELECT_NAMES[sc-1]}复式）。</p>
    `;
    return wrapper;
}

function renderK8DantuoPanel(sc) {
    const dan = quickState.form.redDanTotal;
    const tuo = quickState.form.redTuoTotal;
    const valid = dan >= 1 && dan < sc && dan + tuo >= sc + 1;
    const ticketCount = valid ? combination(tuo, sc - dan) : 0;
    const wrapper = document.createElement('div');
    wrapper.className = 'config-card';
    wrapper.innerHTML = `
        <div class="form-grid four-col">
            <label class="field-block">
                <span class="field-label">生成组数</span>
                <input class="field-input" data-field="generateCount" type="number" min="1" max="50" value="${quickState.form.generateCount}">
            </label>
            <label class="field-block">
                <span class="field-label">胆码数量</span>
                <input class="field-input" data-field="redDanTotal" type="number" min="1" max="${sc - 1}" value="${dan}">
            </label>
            <label class="field-block">
                <span class="field-label">拖码数量</span>
                <input class="field-input" data-field="redTuoTotal" type="number" min="1" max="79" value="${tuo}">
            </label>
        </div>
        <p class="helper-text">${valid ? `每组产生 <b>${ticketCount}</b> 注（${K8_SELECT_NAMES[sc-1]}胆拖）。` : '请确保胆码 ≥1、胆+拖 > 选几。'}</p>
    `;
    return wrapper;
}

function renderK8Results(results, sc) {
    if (!results.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = '先配置玩法，再点击「开始生成」。';
        return empty;
    }

    const mode = results[0].mode;
    const modeLabel = mode === 'single' ? '单式' : mode === 'multiple' ? '复式' : '胆拖';
    const wrapper = document.createElement('div');
    wrapper.className = 'slip-wrapper';

    const titleRow = document.createElement('div');
    titleRow.className = 'slip-header';
    titleRow.innerHTML = `<span class="slip-title">选号单</span><span class="slip-meta">快乐8 · ${K8_SELECT_NAMES[sc-1]} · ${modeLabel}</span>`;
    wrapper.appendChild(titleRow);

    const list = document.createElement('div');
    list.className = 'slip-list';
    results.forEach((ticket, idx) => {
        const row = document.createElement('div');
        row.className = 'slip-row';
        const label = document.createElement('span');
        label.className = 'slip-row-label';
        label.textContent = `第 ${idx + 1} 组`;
        row.appendChild(label);
        const balls = document.createElement('span');
        balls.className = 'slip-row-balls';
        if (ticket.mode === 'dantuo') {
            balls.textContent = `胆 ${formatNums(ticket.redDan)}  拖 ${formatNums(ticket.redTuo)}`;
        } else {
            balls.textContent = `选号 ${formatNums(ticket.red)}`;
        }
        row.appendChild(balls);
        list.appendChild(row);
    });

    // 杀号组行（K8自动选号模式）
    let k8KillEntry = null;
    if (quickState && quickState.isAutoMode && quickState.killGroups && quickState.killGroups.length > 0) {
        k8KillEntry = quickState.killGroups[quickState.killGroups.length - 1];
        const kRow = document.createElement('div');
        kRow.className = 'slip-row slip-row-kill';
        const kLabel = document.createElement('span');
        kLabel.className = 'slip-row-label';
        kLabel.textContent = '杀号组';
        kRow.appendChild(kLabel);
        const kBalls = document.createElement('span');
        kBalls.className = 'slip-row-balls';
        kBalls.textContent = `选号 ${formatNums(k8KillEntry.red)}`;
        kRow.appendChild(kBalls);
        list.appendChild(kRow);
    }
    wrapper.appendChild(list);

    const totalTickets = results.reduce((s, t) => {
        if (t.mode === 'single') return s + 1;
        if (t.mode === 'multiple') return s + combination(t.red.length, sc);
        return s + combination(t.redTuo.length, sc - t.redDan.length);
    }, 0);
    // 杀号组固定视为1注（选20单式）
    const killK8Notes = k8KillEntry ? 1 : 0;
    const allK8Tickets = totalTickets + killK8Notes;
    const totalCost = allK8Tickets * 2;

    const footer = document.createElement('div');
    footer.className = 'slip-footer';
    footer.innerHTML = `<span>共 <strong>${results.length + killK8Notes}</strong> 组 · <strong>${allK8Tickets}</strong> 注</span><span class="slip-cost">¥ ${totalCost.toFixed(2)}</span>`;
    wrapper.appendChild(footer);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'slip-copy-btn';
    copyBtn.textContent = '一键复制';
    copyBtn.addEventListener('click', () => {
        const lines = results.map((ticket, idx) => {
            if (ticket.mode === 'dantuo') {
                return `第${idx + 1}组：胆 ${formatNums(ticket.redDan)}  拖 ${formatNums(ticket.redTuo)}`;
            }
            return `第${idx + 1}组：${formatNums(ticket.red)}`;
        });
        if (k8KillEntry) {
            lines.push(`杀号组：${formatNums(k8KillEntry.red)}`);
        }
        lines.push(`共${results.length + killK8Notes}组 ${allK8Tickets}注 ¥${totalCost.toFixed(2)}`);
        navigator.clipboard.writeText(lines.join('\n')).then(() => {
            copyBtn.textContent = '已复制 ✓';
            setTimeout(() => { copyBtn.textContent = '一键复制'; }, 2000);
        }).catch(() => {
            copyBtn.textContent = '复制失败';
            setTimeout(() => { copyBtn.textContent = '一键复制'; }, 2000);
        });
    });
    wrapper.appendChild(copyBtn);

    return wrapper;
}

/* 扩展 auto-start 事件处理（k8 专有） */
function handleK8AutoStart() {
    if (!quickState || !quickState.isAutoMode || quickState.game !== 'k8') return;
    const killGroupCount = getSelectorConfig()['k8']?.killGroupCount || 4;
    quickState.killGroups = [];
    for (let i = 0; i < killGroupCount; i++) {
        const drawn = simulatePhysicalDrawFromPool(buildPool(80, new Set()), 20).drawn;
        quickState.killGroups.push({ red: drawn, blue: [] });
    }
    const killGroup = quickState.killGroups[killGroupCount - 1];
    quickState.killedRed  = new Set(killGroup.red);
    quickState.killedBlue = new Set();
    quickState.step = 'kill';
    renderK8Page(true);
}

function handleK8ConfirmKill() {
    if (!quickState || !quickState.isAutoMode || quickState.game !== 'k8') return;
    quickState.step = 'configure';
    renderK8Page(true);
}

/* ═══════════════════════════════════════════════════════
   历史验证器
   ═══════════════════════════════════════════════════════ */

let validatorState = null;

function createValidatorState() {
    return {
        game: 'ssq',
        k8SelectMode: 8,
        ticket: null,         // { mode, red, blue } 或 { mode, red } for k8
        windowSize: 100,      // 验证期数
        step: 'config',       // 'config' | 'result'
        running: false,
        report: null,
        error: ''
    };
}

function renderValidatorPage() {
    subpageContent.innerHTML = '';
    if (!validatorState) { validatorState = createValidatorState(); }
    if (validatorState.step === 'config') {
        subpageContent.appendChild(buildValidatorConfigUI());
    } else {
        subpageContent.appendChild(buildValidatorConfigUI());
        if (validatorState.report) {
            subpageContent.appendChild(buildValidatorReportUI(validatorState.report));
        }
    }
}

function buildValidatorConfigUI() {
    const vs = validatorState;
    const wrap = document.createElement('div');
    wrap.className = 'validator-wrap';

    // 彩种选择
    const gameRow = document.createElement('div');
    gameRow.className = 'form-row';
    gameRow.innerHTML = '<label>选择彩种</label>';
    const gameSwitch = document.createElement('div');
    gameSwitch.className = 'mode-switch';
    [['ssq','双色球'],['dlt','大乐透'],['k8','快乐8']].forEach(([g, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-tab' + (vs.game === g ? ' active' : '');
        btn.dataset.vGame = g;
        btn.textContent = label;
        gameSwitch.appendChild(btn);
    });
    gameRow.appendChild(gameSwitch);
    wrap.appendChild(gameRow);

    // k8 固定使用 20 个号码，不再显示玩法选项
    if (vs.game === 'k8') {
        const k8Note = document.createElement('div');
        k8Note.className = 'auto-mode-note';
        k8Note.textContent = '快乐8 空号校验：固定选 20 个号码（与开奖 20 个直接比对），统计轮空次数';
        wrap.appendChild(k8Note);
    }

    // 验证期数
    const windowRow = document.createElement('div');
    windowRow.className = 'form-row';
    windowRow.innerHTML = '<label>验证期数</label>';
    const windowSwitch = document.createElement('div');
    windowSwitch.className = 'mode-switch';
    [[50,'50期'],[100,'100期'],[200,'200期'],[0,'全部']].forEach(([w, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-tab' + (vs.windowSize === w ? ' active' : '');
        btn.dataset.vWindow = String(w);
        btn.textContent = label;
        windowSwitch.appendChild(btn);
    });
    windowRow.appendChild(windowSwitch);
    wrap.appendChild(windowRow);

    // 号码输入
    const ticketSection = document.createElement('div');
    ticketSection.className = 'validator-ticket-section';
    const ticketTitle = document.createElement('p');
    ticketTitle.className = 'validator-section-title';
    if (vs.game === 'k8') {
        ticketTitle.textContent = '输入 20 个号码（或随机生成）';
    } else {
        ticketTitle.textContent = '输入一注号码';
    }
    ticketSection.appendChild(ticketTitle);

    const ticketDisplay = document.createElement('div');
    ticketDisplay.className = 'validator-ticket-display';
    if (vs.ticket) {
        const config = LOTTERY_CONFIG[vs.game];
        if (vs.ticket.mode === 'single') {
            if (config.isK8) {
                ticketDisplay.innerHTML = `<span class="vt-label">20个号</span>${vs.ticket.red.map(n=>`<span class="mini-ball k8">${String(n).padStart(2,'0')}</span>`).join('')}`;
            } else {
                ticketDisplay.innerHTML = vs.ticket.red.map(n=>`<span class="mini-ball red">${String(n).padStart(2,'0')}</span>`).join('')
                    + (vs.ticket.blue && vs.ticket.blue.length ? vs.ticket.blue.map(n=>`<span class="mini-ball blue">${String(n).padStart(2,'0')}</span>`).join('') : '');
            }
        }
    } else {
        ticketDisplay.textContent = '尚未输入号码';
        ticketDisplay.className += ' empty';
    }
    ticketSection.appendChild(ticketDisplay);

    const ticketBtns = document.createElement('div');
    ticketBtns.className = 'validator-ticket-btns';
    const randomBtn = document.createElement('button');
    randomBtn.type = 'button';
    randomBtn.className = 'btn-secondary';
    randomBtn.dataset.vAction = 'randomTicket';
    randomBtn.textContent = '随机生成一注';
    ticketBtns.appendChild(randomBtn);
    ticketSection.appendChild(ticketBtns);
    wrap.appendChild(ticketSection);

    // 运行按钮
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'generate-btn';
    runBtn.dataset.vAction = 'runValidation';
    runBtn.disabled = vs.running || !vs.ticket;
    runBtn.textContent = vs.running ? '验证中...' : '开始验证';
    wrap.appendChild(runBtn);

    if (vs.error) {
        const err = document.createElement('div');
        err.className = 'error-banner';
        err.textContent = vs.error;
        wrap.appendChild(err);
    }

    return wrap;
}

/* 计算单期命中 */
function getHitInfo(ticket, draw, game, k8SelectMode) {
    const config = LOTTERY_CONFIG[game];
    if (config.isK8) {
        // K8 空号校验：直接比对 20 个号，不计算具体玩法，只记录命中球数
        const drawSet = new Set(draw.red);
        const selected = ticket.red || [];
        const hitCount = selected.filter(n => drawSet.has(n)).length;
        // K8 空号模式：不返回奖项，只返回命中球数
        return { hitCount, redHit: hitCount, blueHit: 0, prize: null };
    }
    const drawRedSet  = new Set(draw.red);
    const drawBlueSet = new Set(draw.blue);
    const redHit  = (ticket.red  || []).filter(n => drawRedSet.has(n)).length;
    const blueHit = (ticket.blue || []).filter(n => drawBlueSet.has(n)).length;
    const hitCount = redHit + blueHit;
    const prize = game === 'ssq' ? getSsqPrize(redHit, blueHit) : getDltPrize(redHit, blueHit);
    return { hitCount, redHit, blueHit, prize };
}

function runValidation() {
    if (!validatorState || !validatorState.ticket) return;
    const vs = validatorState;
    const draws = LotteryDB.getDraws(vs.game);
    if (!draws || draws.length === 0) {
        vs.error = '暂无历史数据，请稍候再试。';
        renderValidatorPage();
        return;
    }
    const limited = vs.windowSize === 0 ? draws : draws.slice(0, vs.windowSize);
    const totalPeriods = limited.length;

    const details = [];
    let totalRedHit = 0, totalBlueHit = 0;
    let allZeroCount = 0, redZeroCount = 0;

    limited.forEach(draw => {
        const { hitCount, redHit, blueHit, prize } = getHitInfo(vs.ticket, draw, vs.game, vs.k8SelectMode);
        details.push({ code: draw.code, date: draw.date, redHit, blueHit, hitCount, prize });
        totalRedHit += redHit;
        totalBlueHit += blueHit;
        if (redHit === 0 && blueHit === 0) allZeroCount++;
        if (redHit === 0) redZeroCount++;
    });

    const avgRedHit   = totalPeriods > 0 ? (totalRedHit  / totalPeriods).toFixed(2) : '0.00';
    const avgBlueHit  = totalPeriods > 0 ? (totalBlueHit / totalPeriods).toFixed(2) : '0.00';
    const allZeroRound = allZeroCount > 0 ? (totalPeriods / allZeroCount).toFixed(1) : '∞';
    const redZeroRound = redZeroCount > 0 ? (totalPeriods / redZeroCount).toFixed(1) : '∞';
    const bestHitPeriod = details.reduce((best, d) => d.hitCount > (best ? best.hitCount : -1) ? d : best, null);
    const winPeriods = details.filter(d => d.prize);

    const report = {
        game: vs.game, k8SelectMode: vs.k8SelectMode, ticket: vs.ticket,
        totalPeriods, details,
        stats: { avgRedHit, avgBlueHit, allZeroCount, allZeroRound, redZeroCount, redZeroRound,
                 winCount: winPeriods.length, bestHitPeriod }
    };
    vs.report = report;
    vs.step = 'result';

    // 保存到 ValidationLog
    ValidationLog.add({
        game: vs.game, k8SelectMode: vs.k8SelectMode, ticket: vs.ticket,
        windowSize: vs.windowSize, totalPeriods, stats: report.stats
    });

    renderValidatorPage();

    // 异步触发 AI 自动校准（非阻塞）
    autoAdjustFromValidation(report).catch(() => {});
}

/* 构建验证报告 UI */
function buildValidatorReportUI(report) {
    const { stats, details, game, k8SelectMode, totalPeriods } = report;
    const config = LOTTERY_CONFIG[game];

    const wrap = document.createElement('div');
    wrap.className = 'validator-report';

    // 统计汇总卡片
    const statsGrid = document.createElement('div');
    statsGrid.className = 'validator-stats-grid';

    const isK8 = config.isK8;
    const cardDefs = isK8
        ? [
            { label: '验证期数', main: totalPeriods + ' 期', sub: '' },
            { label: '平均命中球数', main: stats.avgRedHit + ' 个', sub: '20 vs 20，直接对比开奖号' },
            { label: '全空轮次间隔', main: stats.allZeroRound + ' 期', sub: `${totalPeriods} 期中有 ${stats.allZeroCount} 期全空（0个命中）` },
            { label: '低命中轮次间隔', main: stats.redZeroRound + ' 期', sub: `${stats.redZeroCount} 期命中 ≤5 个（轮空参考）` }
          ]
        : [
            { label: '验证期数', main: totalPeriods + ' 期', sub: '' },
            { label: '平均红球命中', main: stats.avgRedHit + ' 个', sub: `平均蓝球命中 ${stats.avgBlueHit} 个` },
            { label: '全零命中轮次', main: stats.allZeroRound + ' 期', sub: `${stats.allZeroCount} 期红蓝均为0` },
            { label: '红球零命中轮次', main: stats.redZeroRound + ' 期', sub: `${stats.redZeroCount} 期红球0命中` },
            { label: '有奖期数', main: stats.winCount + ' 次', sub: `中奖率 ${totalPeriods > 0 ? ((stats.winCount / totalPeriods)*100).toFixed(1) : 0}%` }
          ];

    cardDefs.forEach(c => {
        const card = document.createElement('div');
        card.className = 'validator-stat-card';
        card.innerHTML = `<div class="validator-stat-label">${c.label}</div>
            <div class="validator-stat-main">${c.main}</div>
            <div class="validator-stat-sub">${c.sub}</div>`;
        statsGrid.appendChild(card);
    });
    wrap.appendChild(statsGrid);

    // 期次明细（最近50期）
    const detailWrap = document.createElement('div');
    detailWrap.className = 'validator-detail';
    const detailTitle = document.createElement('p');
    detailTitle.className = 'validator-section-title';
    detailTitle.textContent = isK8
        ? `最近 ${Math.min(50, totalPeriods)} 期明细（命中数 / 开奖20个号的匹配数）`
        : `最近 ${Math.min(50, totalPeriods)} 期明细（高亮=有奖）`;
    detailWrap.appendChild(detailTitle);

    const SHOW_MAX = 50;
    details.slice(0, SHOW_MAX).forEach(d => {
        const isLowHit = isK8 && d.hitCount <= 5;
        const row = document.createElement('div');
        row.className = 'validator-period-row' + (isK8 ? (isLowHit ? ' has-prize' : '') : (d.prize ? ' has-prize' : ''));
        const hitText = isK8
            ? `命中 ${d.hitCount} 个${isLowHit ? ' ← 轮空' : ''}`
            : `红 ${d.redHit} 蓝 ${d.blueHit}`;
        row.innerHTML = `<span class="vp-code">${d.code}</span>
            <span class="vp-date">${d.date}</span>
            <span class="vp-hit">${hitText}</span>
            <span class="vp-prize">${isK8 ? '' : (d.prize ? d.prize.label : '未中奖')}</span>`;
        detailWrap.appendChild(row);
    });
    wrap.appendChild(detailWrap);

    return wrap;
}

/* ═══════════════════════════════════════════════════════
   AI 自动校准系统（硅基流动 / Kimi-K2.6）
   ═══════════════════════════════════════════════════════ */

const AI_CONFIG = {
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    model: 'Pro/moonshotai/Kimi-K2.6',
    getKey() {
        return localStorage.getItem('siliconflow_api_key') || 'sk-olalmjgkzkhdqbtfdbywvwkpqblimalbhzruvpeugfbanlxy';
    }
};

async function callKimiAI(systemPrompt, userMessage) {
    const key = AI_CONFIG.getKey();
    if (!key) throw new Error('未配置 AI API Key');
    const resp = await fetch(AI_CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
            model: AI_CONFIG.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.3,
            max_tokens: 500
        })
    });
    if (!resp.ok) throw new Error(`AI API 返回 ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
}

async function autoAdjustFromValidation(report) {
    const { stats, game, k8SelectMode, totalPeriods } = report;
    if (totalPeriods < 50) return; // 数据太少，不触发校准

    // 触发条件：全零命中轮次与理论值偏差 >= 1.5 期
    const theoretical = {
        ssq: 4.0,  // 4组杀号后预期全空轮次
        dlt: 4.0,
        k8: 5.0    // k8 从80选N，全空概率更高
    };
    const expected = theoretical[game] || 4.0;
    const actual = parseFloat(stats.allZeroRound);
    if (isNaN(actual) || Math.abs(actual - expected) < 1.5) return; // 偏差未达阈值

    // 检查最近3条记录是否也有偏差（连续2次以上）
    const recentLogs = ValidationLog.getAll().filter(r => r.game === game).slice(0, 3);
    const consistentDeviation = recentLogs.filter(r => {
        const a = parseFloat(r.stats?.allZeroRound);
        return !isNaN(a) && Math.abs(a - expected) >= 1.5;
    }).length;
    if (consistentDeviation < 2) return; // 未达到连续偏差阈值

    const systemPrompt = `你是彩票选号系统的参数优化助手。系统使用"4组杀号"策略自动选号：
生成4组随机号，用第4组作为"杀号"排除出去，再从剩余号码中选出最终号码。
当前系统可调参数：killGroupCount（默认4，范围2-6）。
你的任务是根据统计数据给出参数调整建议，返回JSON格式：{"killGroupCount": N, "reason": "简短原因（不超过50字）"}`;

    const userMessage = `彩种：${LOTTERY_CONFIG[game].name}${game==='k8'?` ${K8_SELECT_NAMES[k8SelectMode-1]}`:''}
验证期数：${totalPeriods}
全零命中轮次（实际）：${stats.allZeroRound}
全零命中轮次（理论）：${expected}
红球零命中轮次：${stats.redZeroRound}
偏差：${actual > expected ? '实际全空轮次偏高（全空太少）' : '实际全空轮次偏低（全空太多）'}
请给出参数调整建议。`;

    try {
        const aiText = await callKimiAI(systemPrompt, userMessage);
        let suggestion = null;
        try {
            const jsonMatch = aiText.match(/\{[\s\S]*?\}/);
            if (jsonMatch) suggestion = JSON.parse(jsonMatch[0]);
        } catch (_) { suggestion = null; }

        if (!suggestion || !suggestion.killGroupCount) return;

        const SelectorConfig = getSelectorConfig();
        const beforeKillCount = SelectorConfig[game]?.killGroupCount || 4;
        const afterKillCount  = Math.max(1, Math.round(suggestion.killGroupCount));

        if (beforeKillCount === afterKillCount) return; // 无变化

        // 应用参数
        SelectorConfig[game] = { ...SelectorConfig[game], killGroupCount: afterKillCount };
        saveSelectorConfig(SelectorConfig);

        // 保存记录
        ValidationLog.addAIAdjustment({
            game, k8SelectMode,
            trigger: `全零命中轮次偏差 ${(actual - expected).toFixed(1)} 期`,
            aiResponse: aiText,
            paramsBefore: { killGroupCount: beforeKillCount },
            paramsAfter:  { killGroupCount: afterKillCount },
            reason: suggestion.reason || '',
            changeApplied: true
        });

        // 重新渲染校验记录（如果当前页面是 validation-log）
        if (activePageKey === 'validation-log') renderValidationLogPage();

    } catch (_) {
        // AI 调用失败，静默忽略
    }
}

/* ─── SelectorConfig：选号参数存储 ─── */
const SELECTOR_CONFIG_KEY = 'lottery_selector_config_v1';

function getSelectorConfig() {
    try {
        const raw = localStorage.getItem(SELECTOR_CONFIG_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
}

function saveSelectorConfig(cfg) {
    try { localStorage.setItem(SELECTOR_CONFIG_KEY, JSON.stringify(cfg)); } catch (_) {}
}

/* ═══════════════════════════════════════════════════════
   ValidationLog：校验记录存储
   ═══════════════════════════════════════════════════════ */

const VLOG_KEY = 'validation_log_v1';

const ValidationLog = {
    getAll() {
        try {
            const raw = localStorage.getItem(VLOG_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (_) { return []; }
    },
    _save(list) {
        try { localStorage.setItem(VLOG_KEY, JSON.stringify(list.slice(0, 200))); } catch (_) {}
    },
    add(entry) {
        const list = this.getAll();
        list.unshift({
            id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            timestamp: Date.now(),
            type: 'validation',
            ...entry
        });
        this._save(list);
    },
    addAIAdjustment(entry) {
        const list = this.getAll();
        list.unshift({
            id: Date.now() + '-ai-' + Math.random().toString(36).slice(2, 7),
            timestamp: Date.now(),
            type: 'ai-adjustment',
            ...entry
        });
        this._save(list);
    },
    rollback(id) {
        const list = this.getAll();
        const rec = list.find(r => r.id === id);
        if (!rec || !rec.paramsBefore) return false;
        const cfg = getSelectorConfig();
        cfg[rec.game] = { ...cfg[rec.game], ...rec.paramsBefore };
        saveSelectorConfig(cfg);
        const idx = list.indexOf(rec);
        if (idx >= 0) {
            list[idx] = { ...rec, changeApplied: false, rolledBack: true, rollbackAt: Date.now() };
        }
        this._save(list);
        return true;
    },
    clear() {
        try { localStorage.removeItem(VLOG_KEY); } catch (_) {}
    }
};

/* ─── 空号校验工具状态 ─── */
let manualCheckState = null;

/**
 * 创建空号校验初始状态
 * running: 是否正在运行（async）
 * progress: 0-100
 * result: 完成后的统计结果对象
 */
function createManualCheckState() {
    return {
        game: 'ssq',
        k8SelectMode: 8,
        windowSize: 100,
        running: false,
        progress: 0,
        result: null,
        error: ''
    };
}

// 双色球特别版：从1-33抽15个红球
const SSQ_SPECIAL_PICK = 15;

/**
 * 生成空号校验工具 UI（无需手动选球）
 * 用户选择彩种 + 期数 → 点击开始 → 后台物理摇奖机跑1000注 → 输出统计
 */
function buildManualCheckUI() {
    const mc = manualCheckState;
    const _isSsqSpecialUI = mc.game === 'ssq-special';
    const config = LOTTERY_CONFIG[_isSsqSpecialUI ? 'ssq' : mc.game];
    const isK8 = config.isK8;

    const section = document.createElement('section');
    section.className = 'preview-card';

    const titleEl = document.createElement('h3');
    titleEl.className = 'preview-title';
    titleEl.textContent = '蒙特卡洛空号校验';
    section.appendChild(titleEl);

    const subEl = document.createElement('p');
    subEl.className = 'preview-desc';
    const isSsqSp = manualCheckState && manualCheckState.game === 'ssq-special';
    subEl.textContent = isSsqSp
        ? '用物理摇奖机自动生成100000注15红球号码，与历史开奖红球逐一比对，统计平均每注命中几个红球，以及平均多少期出现红球全空（0命中）。'
        : '用物理摇奖机自动生成100000注号码，与历史开奖逐一比对，统计平均每隔多少期出现全部落空和红球全空。';
    section.appendChild(subEl);

    const wrap = document.createElement('div');
    wrap.className = 'validator-wrap';

    // ── 彩种选择 ──
    const gameRow = document.createElement('div');
    gameRow.className = 'form-row';
    gameRow.innerHTML = '<label>选择彩种</label>';
    const gameSwitch = document.createElement('div');
    gameSwitch.className = 'mode-switch';
    [['ssq', '双色球'], ['dlt', '大乐透'], ['k8', '快乐8'], ['ssq-special', '双色球特别版']].forEach(([g, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-tab' + (mc.game === g ? ' active' : '');
        btn.dataset.mcGame = g;
        btn.textContent = label;
        gameSwitch.appendChild(btn);
    });
    gameRow.appendChild(gameSwitch);
    wrap.appendChild(gameRow);

    // ── 双色球特别版说明 ──
    if (mc.game === 'ssq-special') {
        const spNote = document.createElement('div');
        spNote.className = 'auto-mode-note';
        spNote.textContent = '双色球特别版：从1-33号红球池中抽取15个红球，与开奖6个红球比对，统计平均命中数及红球全空间隔。';
        wrap.appendChild(spNote);
    }

    // ── K8 固定 20 球（无需选法选项卡）──
    if (isK8) {
        const k8Note = document.createElement('div');
        k8Note.className = 'auto-mode-note';
        k8Note.textContent = '快乐8 空号校验：每注固定 20 个号（与开奖 20 个直接比对）';
        wrap.appendChild(k8Note);
    }

    // ── 验证期数 ──
    const windowRow = document.createElement('div');
    windowRow.className = 'form-row';
    windowRow.innerHTML = '<label>验证期数</label>';
    const windowSwitch = document.createElement('div');
    windowSwitch.className = 'mode-switch';
    [[50, '50期'], [100, '100期'], [200, '200期'], [0, '全部']].forEach(([w, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-tab' + (mc.windowSize === w ? ' active' : '');
        btn.dataset.mcWindow = String(w);
        btn.textContent = label;
        windowSwitch.appendChild(btn);
    });
    windowRow.appendChild(windowSwitch);
    wrap.appendChild(windowRow);

    // ── 提示说明 ──
    const noteEl = document.createElement('p');
    noteEl.className = 'validator-section-title';
    noteEl.style.marginTop = '12px';
    noteEl.textContent = '每注号码均使用物理摇奖机模型（多轮洗牌 + 顺序出球），不使用快速随机。全部模式运行时间约10~30秒。';
    wrap.appendChild(noteEl);

    // ── 操作按钮 ──
    const actBar = document.createElement('div');
    actBar.className = 'actions-bar';
    actBar.style.gap = '12px';

    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'generate-btn';
    runBtn.dataset.mcAction = 'run';
    runBtn.disabled = mc.running;
    runBtn.textContent = mc.running ? '校验中...' : '开始校验';
    actBar.appendChild(runBtn);
    wrap.appendChild(actBar);

    // ── 运行中进度条 ──
    if (mc.running) {
        const progWrap = document.createElement('div');
        progWrap.className = 'mc-progress-wrap';
        progWrap.innerHTML = `
            <div class="mc-progress-bar">
                <div class="mc-progress-fill" style="width:${mc.progress}%"></div>
            </div>
            <p class="mc-progress-label">
                ${mc.windowSize === 0 ? '后台正在运行中，不以速度换质量，请耐心等待…' : '正在模拟摇奖与比对，请稍候…'}
                &nbsp;<strong>${mc.progress}%</strong>
            </p>`;
        wrap.appendChild(progWrap);
    }

    if (mc.error) {
        const err = document.createElement('div');
        err.className = 'error-banner';
        err.textContent = mc.error;
        wrap.appendChild(err);
    }

    section.appendChild(wrap);

    // ── 校验结果 ──
    if (mc.result) {
        section.appendChild(buildManualCheckResultUI(mc.result));
    }

    return section;
}

/**
 * 渲染蒙特卡洛校验结果卡片
 * report: { game, k8SelectMode, ticketCount, windowSize, totalPeriods,
 *           avgAllMissGap, avgRedMissGap,
 *           distAllMiss: [{range, count}], pctAllMiss }
 */
function buildManualCheckResultUI(report) {
    const { game, k8SelectMode, ticketCount, totalPeriods,
            avgAllMissGap, avgRedMissGap, pctAllMiss, pctRedMiss,
            avgRedHit, hitDistCount, distAllMiss } = report;
    const isSsqSpecial = game === 'ssq-special';
    const actualGame   = isSsqSpecial ? 'ssq' : game;
    const config = LOTTERY_CONFIG[actualGame];
    const isK8 = config.isK8;

    const wrap = document.createElement('div');
    wrap.className = 'validator-report';

    // 结果标题
    const rtitle = document.createElement('p');
    rtitle.className = 'validator-section-title';
    rtitle.style.marginTop = '16px';
    const gameLabel = isSsqSpecial ? `双色球特别版（15红球）`
        : isK8 ? `快乐8·${K8_SELECT_NAMES[k8SelectMode - 1]}` : config.name;
    rtitle.textContent = `${gameLabel} · ${ticketCount}注 × ${totalPeriods}期 蒙特卡洛模拟结果`;
    wrap.appendChild(rtitle);

    // 统计卡片
    const statsGrid = document.createElement('div');
    statsGrid.className = 'validator-stats-grid';

    const cards = isSsqSpecial
        ? [
            { label: '模拟票数',         main: ticketCount + ' 注',    sub: '物理摇奖机生成' },
            { label: '验证期数',         main: totalPeriods + ' 期',   sub: '' },
            { label: '平均每期命中红球', main: avgRedHit + ' 个',       sub: '每注15红球平均命中' },
            { label: '红球全空间隔',     main: avgRedMissGap + ' 期',   sub: '平均多少期红球全不中' },
            { label: '红球全空概率',     main: pctRedMiss + '%',        sub: '每期红球全0命中率' }
          ]
        : isK8
        ? [
            { label: '模拟票数',     main: ticketCount + ' 注',  sub: '物理摇奖机生成' },
            { label: '验证期数',     main: totalPeriods + ' 期', sub: '' },
            { label: '平均全空间隔', main: avgAllMissGap + ' 期', sub: '每注平均每隔N期全落空' },
            { label: '全空概率',     main: pctAllMiss + '%',      sub: '每期落空率' }
          ]
        : [
            { label: '模拟票数',         main: ticketCount + ' 注',   sub: '物理摇奖机生成' },
            { label: '验证期数',         main: totalPeriods + ' 期',  sub: '' },
            { label: '平均全零间隔',     main: avgAllMissGap + ' 期',  sub: '红+蓝全部落空' },
            { label: '平均红球轮空间隔', main: avgRedMissGap + ' 期',  sub: '红球全部落空' }
          ];

    cards.forEach(c => {
        const card = document.createElement('div');
        card.className = 'validator-stat-card';
        card.innerHTML = `<div class="validator-stat-label">${c.label}</div>
            <div class="validator-stat-main">${c.main}</div>
            <div class="validator-stat-sub">${c.sub}</div>`;
        statsGrid.appendChild(card);
    });
    wrap.appendChild(statsGrid);

    // 双色球特别版：命中数分布
    if (isSsqSpecial && hitDistCount && hitDistCount.length > 0) {
        const hitTitle = document.createElement('p');
        hitTitle.className = 'validator-section-title';
        hitTitle.style.marginTop = '16px';
        hitTitle.textContent = `命中红球数分布（${ticketCount}注，按各注典型命中档位统计）`;
        wrap.appendChild(hitTitle);

        const maxHitCount = Math.max(...hitDistCount);
        const hitGrid = document.createElement('div');
        hitGrid.className = 'mc-dist-grid';
        hitDistCount.forEach((cnt, idx) => {
            const pct = maxHitCount > 0 ? (cnt / maxHitCount * 100).toFixed(0) : 0;
            const row = document.createElement('div');
            row.className = 'mc-dist-row';
            row.innerHTML = `<span class="mc-dist-label">命中${idx}个</span>
                <span class="mc-dist-bar-wrap"><span class="mc-dist-bar" style="width:${pct}%"></span></span>
                <span class="mc-dist-count">${cnt}</span>`;
            hitGrid.appendChild(row);
        });
        wrap.appendChild(hitGrid);
    }

    // 全空间隔分布（非特别版）
    if (!isSsqSpecial && distAllMiss && distAllMiss.length > 0) {
        const distTitle = document.createElement('p');
        distTitle.className = 'validator-section-title';
        distTitle.style.marginTop = '16px';
        distTitle.textContent = `全零间隔分布（${ticketCount}注中各区间票数）`;
        wrap.appendChild(distTitle);

        const maxCount = Math.max(...distAllMiss.map(d => d.count));
        const distGrid = document.createElement('div');
        distGrid.className = 'mc-dist-grid';
        distAllMiss.forEach(d => {
            const pct = maxCount > 0 ? (d.count / maxCount * 100).toFixed(0) : 0;
            const row = document.createElement('div');
            row.className = 'mc-dist-row';
            row.innerHTML = `<span class="mc-dist-label">${d.range}</span>
                <span class="mc-dist-bar-wrap"><span class="mc-dist-bar" style="width:${pct}%"></span></span>
                <span class="mc-dist-count">${d.count}</span>`;
            distGrid.appendChild(row);
        });
        wrap.appendChild(distGrid);
    }

    // 解读说明
    const interp = document.createElement('p');
    interp.className = 'mc-interp-note';
    if (isSsqSpecial) {
        interp.textContent = `解读：在${totalPeriods}期历史数据中，从1-33号红球池随机取15个球，平均每期能命中开奖红球 ${avgRedHit} 个，平均每 ${avgRedMissGap} 期出现一次红球全部落空（0命中），全空率约 ${pctRedMiss}%。`;
    } else if (isK8) {
        interp.textContent = `解读：在${totalPeriods}期历史数据中，每注快乐8号码平均每 ${avgAllMissGap} 期出现一次"全部落空"，整体全空率约 ${pctAllMiss}%。`;
    } else {
        interp.textContent = `解读：在${totalPeriods}期历史数据中，每注号码平均每 ${avgAllMissGap} 期出现一次"红蓝全部落空"，红球平均每 ${avgRedMissGap} 期出现一次"全部落空"，红球全空率约 ${pctRedMiss}%。`;
    }
    wrap.appendChild(interp);

    return wrap;
}

/**
 * 核心蒙特卡洛校验函数（异步，分批次处理避免阻塞 UI）
 * 使用 simulatePhysicalDrawFromPool（物理摇奖机模型），不使用 Math.random 快速路径
 */
async function runManualCheck() {
    if (!manualCheckState) return;
    const mc = manualCheckState;
    const _isSsqSpecialEarly = mc.game === 'ssq-special';
    const _loadGame = _isSsqSpecialEarly ? 'ssq' : mc.game;

    let draws = LotteryDB.getDraws(_loadGame);
    if (!draws || draws.length === 0) {
        // 数据尚未缓存，主动触发加载并等待
        mc.error = '数据加载中，请稍候…';
        renderValidationLogPage();
        try { await LotteryDB.refresh(_loadGame); } catch (_) {}
        draws = LotteryDB.getDraws(_loadGame);
        if (!draws || draws.length === 0) {
            mc.error = '数据获取失败，请检查网络后重试。';
            mc.running = false;
            renderValidationLogPage();
            return;
        }
        mc.error = '';
    }

    const isSsqSpecial = mc.game === 'ssq-special';
    const actualGame   = isSsqSpecial ? 'ssq' : mc.game;
    const config = LOTTERY_CONFIG[actualGame];
    const isK8 = config.isK8;
    const limited = mc.windowSize === 0 ? draws : draws.slice(0, mc.windowSize);
    const totalPeriods = limited.length;
    const TICKET_COUNT = 100000;

    // 预构建每期开奖数据的 Set，节省重复构建开销
    const drawRedSets  = limited.map(d => new Set(d.red));
    const drawBlueSets = isK8 ? null : limited.map(d => new Set(d.blue));

    // 累计统计
    let sumAllMissGap = 0;
    let sumRedMissGap = 0;
    let sumPctAllMiss = 0;
    let sumPctRedMiss = 0;
    let sumRedHitPerPeriod = 0; // 累计每注平均命中红球数
    // 双色球特别版：命中数分布 [0命中,1命中,...,6命中]
    const hitDistCount = isSsqSpecial ? new Array(7).fill(0) : null;

    // 全零间隔分布桶（按间隔区间：<2, 2-4, 4-8, 8-16, 16-32, 32-64, 64-128, >128）
    const BUCKETS = ['<2', '2-3', '4-7', '8-15', '16-31', '32-63', '64-127', '≥128'];
    const bucketCounts = new Array(BUCKETS.length).fill(0);

    function getBucketIdx(gap) {
        if (gap < 2) return 0;
        if (gap < 4) return 1;
        if (gap < 8) return 2;
        if (gap < 16) return 3;
        if (gap < 32) return 4;
        if (gap < 64) return 5;
        if (gap < 128) return 6;
        return 7;
    }

    const CHUNK = 200; // 每批次生成200注，然后 yield 一次
    let processed = 0;

    while (processed < TICKET_COUNT) {
        const end = Math.min(processed + CHUNK, TICKET_COUNT);
        for (let i = processed; i < end; i++) {
            // ── 物理摇奖机生成一注号码 ──
            let ticketRed, ticketBlue = [];
            if (isSsqSpecial) {
                // 双色球特别版：从1-33抽15个红球，不需要蓝球
                const redPool = Array.from({ length: 33 }, (_, idx) => idx + 1);
                ticketRed = simulatePhysicalDrawFromPool(redPool, SSQ_SPECIAL_PICK).drawn;
            } else if (isK8) {
                const pool = Array.from({ length: 80 }, (_, idx) => idx + 1);
                ticketRed = simulatePhysicalDrawFromPool(pool, 20).drawn;
            } else {
                const redPool = Array.from({ length: config.redMax }, (_, idx) => idx + 1);
                ticketRed = simulatePhysicalDrawFromPool(redPool, config.redCount).drawn;
                const bluePool = Array.from({ length: config.blueMax }, (_, idx) => idx + 1);
                ticketBlue = simulatePhysicalDrawFromPool(bluePool, config.blueCount).drawn;
            }
            const ticketRedSet  = new Set(ticketRed);
            const ticketBlueSet = new Set(ticketBlue);

            // ── 逐期比对 ──
            let allMissCount = 0;
            let redMissCount = 0;
            let totalRedHit = 0;
            if (isSsqSpecial) {
                // 特别版：只统计红球命中，记录每注各期命中数分布
                const perPeriodHits = new Array(7).fill(0); // 统计0~6命中的期数
                for (let j = 0; j < totalPeriods; j++) {
                    let redHit = 0;
                    drawRedSets[j].forEach(n => { if (ticketRedSet.has(n)) redHit++; });
                    totalRedHit += redHit;
                    if (redHit === 0) redMissCount++;
                    perPeriodHits[Math.min(6, redHit)]++;
                }
                // 用本注中出现最多的命中数档位计入分布（反映典型命中水平）
                const dominantHit = perPeriodHits.indexOf(Math.max(...perPeriodHits));
                hitDistCount[dominantHit]++;
                allMissCount = redMissCount;
            } else {
                for (let j = 0; j < totalPeriods; j++) {
                    let redHit = 0;
                    drawRedSets[j].forEach(n => { if (ticketRedSet.has(n)) redHit++; });
                    let blueHit = 0;
                    if (!isK8) {
                        drawBlueSets[j].forEach(n => { if (ticketBlueSet.has(n)) blueHit++; });
                    }
                    totalRedHit += redHit;
                    if (redHit === 0 && blueHit === 0) allMissCount++;
                    if (redHit === 0) redMissCount++;
                }
            }
            sumRedHitPerPeriod += totalPeriods > 0 ? totalRedHit / totalPeriods : 0;

            // ── 计算本注平均间隔 ──
            const allMissGap = allMissCount > 0 ? totalPeriods / allMissCount : totalPeriods;
            const redMissGap = redMissCount > 0 ? totalPeriods / redMissCount : totalPeriods;
            const pctAll = totalPeriods > 0 ? (allMissCount / totalPeriods * 100) : 0;
            const pctRed = totalPeriods > 0 ? (redMissCount / totalPeriods * 100) : 0;

            sumAllMissGap += allMissGap;
            sumRedMissGap += redMissGap;
            sumPctAllMiss += pctAll;
            sumPctRedMiss += pctRed;
            if (!isSsqSpecial) bucketCounts[getBucketIdx(allMissGap)]++;
        }
        processed = end;

        // ── yield 让 UI 更新 ──
        mc.progress = Math.round((processed / TICKET_COUNT) * 100);
        renderValidationLogPage();
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    // ── 汇总结果 ──
    mc.result = {
        game: mc.game,
        k8SelectMode: mc.k8SelectMode,
        ticketCount: TICKET_COUNT,
        windowSize: mc.windowSize,
        totalPeriods,
        avgAllMissGap: (sumAllMissGap / TICKET_COUNT).toFixed(1),
        avgRedMissGap: (sumRedMissGap / TICKET_COUNT).toFixed(1),
        pctAllMiss:    (sumPctAllMiss / TICKET_COUNT).toFixed(2),
        pctRedMiss:    (sumPctRedMiss / TICKET_COUNT).toFixed(2),
        avgRedHit:     (sumRedHitPerPeriod / TICKET_COUNT).toFixed(2),
        hitDistCount,
        distAllMiss: BUCKETS.map((range, idx) => ({ range, count: bucketCounts[idx] }))
    };
    mc.error = '';
    mc.running = false;
    mc.progress = 100;

    // 写入校验记录
    ValidationLog.add({
        game: mc.game,
        k8SelectMode: mc.k8SelectMode,
        windowSize: mc.windowSize,
        totalPeriods,
        stats: {
            mode: 'montecarlo',
            ticketCount: TICKET_COUNT,
            avgAllMissGap: mc.result.avgAllMissGap,
            avgRedMissGap: mc.result.avgRedMissGap,
            pctAllMiss: mc.result.pctAllMiss,
            avgRedHit: mc.result.avgRedHit
        }
    });

    renderValidationLogPage();
}

/* ─── 校验记录页面渲染 ─── */
function renderValidationLogPage() {
    subpageContent.innerHTML = '';

    // ── 蒙特卡洛校验工具区 ──
    if (manualCheckState) {
        subpageContent.appendChild(buildManualCheckUI());
    }

    // ── 历史校验记录区 ──
    const records = ValidationLog.getAll();

    const wrap = document.createElement('div');
    wrap.className = 'vallog-wrap';

    const header = document.createElement('div');
    header.className = 'vallog-header';
    const h3 = document.createElement('h3');
    h3.textContent = `校验记录（共 ${records.length} 条）`;
    header.appendChild(h3);
    if (records.length > 0) {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn-secondary';
        clearBtn.dataset.vlogAction = 'clearAll';
        clearBtn.textContent = '清空全部';
        header.appendChild(clearBtn);
    }
    wrap.appendChild(header);

    if (records.length === 0) {
        const empty = document.createElement('p');
        empty.style.cssText = 'color:#666;font-size:0.9rem;padding:20px 0';
        empty.textContent = '暂无记录，先运行一次蒙特卡洛校验吧。';
        wrap.appendChild(empty);
    }

    records.forEach(rec => {
        const entry = document.createElement('div');
        const isAI  = rec.type === 'ai-adjustment';
        const isMC  = rec.stats && rec.stats.mode === 'montecarlo';
        entry.className = 'vallog-entry' + (isAI ? ' ai-adj' : '') + (rec.rolledBack ? ' rolled-back' : '');

        const entryHeader = document.createElement('div');
        entryHeader.className = 'vallog-entry-header';

        const badge = document.createElement('span');
        badge.className = 'vallog-badge ' + (isAI ? 'ai' : (rec.rolledBack ? 'rolled-back' : 'validation'));
        badge.textContent = isAI ? 'AI参数' : (isMC ? '蒙特卡洛' : '验证');
        entryHeader.appendChild(badge);

        const gameName = document.createElement('span');
        gameName.className = 'vallog-game';
        const configName = rec.game ? (LOTTERY_CONFIG[rec.game] ? LOTTERY_CONFIG[rec.game].name : rec.game) : '—';
        gameName.textContent = configName;
        entryHeader.appendChild(gameName);

        const timeEl = document.createElement('span');
        timeEl.className = 'vallog-time';
        timeEl.textContent = rec.timestamp ? new Date(rec.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
        entryHeader.appendChild(timeEl);
        entry.appendChild(entryHeader);

        // 统计摘要
        const statsEl = document.createElement('div');
        statsEl.className = 'vallog-stats';
        if (isMC) {
            const s = rec.stats;
            const isK8game = rec.game === 'k8';
            statsEl.textContent = `验证 ${s.ticketCount} 注 × ${rec.totalPeriods} 期 · 平均全零间隔 ${s.avgAllMissGap} 期`
                + (isK8game ? '' : ` · 红球全空间隔 ${s.avgRedMissGap} 期`)
                + (s.avgRedHit !== undefined ? ` · 平均命中红球 ${s.avgRedHit} 个` : '')
                + ` · 全空率 ${s.pctAllMiss}%`;
        } else if (!isAI && rec.stats) {
            const s = rec.stats;
            const parts = [`验证 ${rec.totalPeriods} 期`];
            if (s.avgRedHit !== undefined) parts.push(`平均红球命中 ${s.avgRedHit}`);
            if (s.avgAllMissGap !== undefined) parts.push(`全零间隔 ${s.allZeroRound} 期`);
            if (s.redZeroRound !== undefined) parts.push(`红球轮空间隔 ${s.redZeroRound} 期`);
            statsEl.textContent = parts.join(' · ');
        } else if (isAI && rec.reason) {
            statsEl.textContent = rec.reason;
        }
        entry.appendChild(statsEl);

        // MC 记录：更新选号策略按钮
        if (isMC && !rec.rolledBack) {
            const stratBtn = document.createElement('button');
            stratBtn.type = 'button';
            stratBtn.className = 'vallog-strategy-btn';
            stratBtn.dataset.mcUpdateStrategy = rec.id;
            stratBtn.textContent = '⚙ 更新选号策略';
            entry.appendChild(stratBtn);
        }

        // AI 参数变更
        if (isAI && rec.paramsBefore && rec.paramsAfter) {
            const paramsEl = document.createElement('div');
            paramsEl.className = 'vallog-params';
            Object.keys(rec.paramsAfter).forEach(k => {
                const span = document.createElement('span');
                span.innerHTML = `${k}: <span class="param-before">${rec.paramsBefore[k] ?? '—'}</span><span class="param-arrow"> → </span><span class="param-after">${rec.paramsAfter[k]}</span>`;
                paramsEl.appendChild(span);
            });
            entry.appendChild(paramsEl);

            if (!rec.rolledBack && !rec.changeApplied === false) {
                const rbBtn = document.createElement('button');
                rbBtn.type = 'button';
                rbBtn.className = 'vallog-rollback-btn';
                rbBtn.dataset.vlogRollback = rec.id;
                rbBtn.textContent = '↩ 回滚此参数';
                entry.appendChild(rbBtn);
            }
        }

        wrap.appendChild(entry);
    });

    subpageContent.appendChild(wrap);
}

