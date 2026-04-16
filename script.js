const LOTTERY_CONFIG = {
    ssq: {
        name: '双色球',
        redCount: 6,
        redMax: 33,
        blueCount: 1,
        blueMax: 16,
        redDanMin: 1,
        blueDanMax: 1,
        defaultMultipleRed: 9,
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
        desc: '这里先作为双色球错过大奖分析的独立界面，避免和其他功能混在同一页。',
        game: 'ssq'
    },
    'dlt-when': {
        title: '啥时候能中100万',
        desc: '这里先作为大乐透概率与模拟分析的独立界面，后续单独补交互。',
        game: 'dlt'
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
    }
};

const QUICK_PAGE_KEYS = new Set(['ssq-quick', 'dlt-quick']);
const AUTO_PAGE_KEYS  = new Set(['ssq-auto',  'dlt-auto']);

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


const subpageView = document.getElementById('subpageView');
const backHomeBtn = document.getElementById('backHomeBtn');
const subpageTitle = document.getElementById('subpageTitle');
const subpageDesc = document.getElementById('subpageDesc');
const modelNoteText = document.getElementById('modelNoteText');
const subpageContent = document.getElementById('subpageContent');
const navCards = Array.from(document.querySelectorAll('.nav-card'));

let activePageKey = null;
let quickState = null;

function secureRandomInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error('maxExclusive 必须是正整数');
    }

    const maxUint32 = 0x100000000;
    const limit = maxUint32 - (maxUint32 % maxExclusive);
    const buffer = new Uint32Array(1);

    while (true) {
        crypto.getRandomValues(buffer);
        const value = buffer[0];
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
    return {
        pageKey,
        game,
        mode: 'single',
        form: {
            generateCount: 5,
            multipleRedTotal: config.defaultMultipleRed,
            multipleBlueTotal: config.defaultMultipleBlue,
            redDanTotal: config.defaultDanTuo.redDan,
            redTuoTotal: config.defaultDanTuo.redTuo,
            blueDanTotal: config.defaultDanTuo.blueDan,
            blueTuoTotal: config.defaultDanTuo.blueTuo
        },
        custom: createEmptyQuickCustomState(),
        results: [],
        error: ''
    };
}

function createAutoState(game, pageKey) {
    const config = LOTTERY_CONFIG[game];
    return {
        pageKey,
        game,
        isAutoMode: true,
        step: 'start', // 'start' | 'kill' | 'configure'
        killGroups: [],
        killedRed:  new Set(),
        killedBlue: new Set(),
        mode: 'single',
        form: {
            generateCount: 5,
            multipleRedTotal: config.defaultMultipleRed,
            multipleBlueTotal: config.defaultMultipleBlue,
            redDanTotal: config.defaultDanTuo.redDan,
            redTuoTotal: config.defaultDanTuo.redTuo,
            blueDanTotal: config.defaultDanTuo.blueDan,
            blueTuoTotal: config.defaultDanTuo.blueTuo
        },
        custom: createEmptyQuickCustomState(),
        results: [],
        error: ''
    };
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
    wrapper.className = 'receipt-wrapper';

    const receipt = document.createElement('div');
    receipt.className = 'receipt';

    const body = document.createElement('div');
    body.className = 'receipt-body';

    // 标题
    const titleEl = document.createElement('div');
    titleEl.className = 'receipt-title';
    titleEl.textContent = '选  号  单';
    body.appendChild(titleEl);

    // 副标题：彩种 + 玩法 + 日期
    const modeLabel = mode === 'single' ? '单式' : mode === 'multiple' ? '复式' : '胆拖';
    const meta = document.createElement('div');
    meta.className = 'receipt-meta';
    meta.textContent = `${config.name}  ${modeLabel}  ${new Date().toLocaleDateString('zh-CN')}`;
    body.appendChild(meta);

    const div1 = document.createElement('hr');
    div1.className = 'receipt-divider';
    body.appendChild(div1);

    // 每注票
    const ticketBox = document.createElement('div');
    ticketBox.className = 'receipt-tickets';
    results.forEach((ticket, idx) => {
        const line = document.createElement('div');
        line.className = 'receipt-ticket';
        const label = `第${String(idx + 1).padStart(3, '0')}注`;
        let content = '';
        if (ticket.mode === 'dantuo') {
            const bluePart = ticket.blueDan.length
                ? `  蓝胆:${formatNums(ticket.blueDan)}  蓝拖:${formatNums(ticket.blueTuo)}`
                : (ticket.blueTuo.length ? `  蓝:${formatNums(ticket.blueTuo)}` : '');
            content = `红胆:${formatNums(ticket.redDan)}  红拖:${formatNums(ticket.redTuo)}${bluePart}`;
        } else {
            content = `红:${formatNums(ticket.red)}  蓝:${formatNums(ticket.blue)}`;
        }
        line.innerHTML = `<span class="receipt-ticket-label">${label}</span>${content}`;
        ticketBox.appendChild(line);
    });
    body.appendChild(ticketBox);

    // 费用合计
    const div2 = document.createElement('hr');
    div2.className = 'receipt-divider';
    body.appendChild(div2);

    const totalTickets = calculateTicketCount(game, mode, form);
    const totalCost    = totalTickets * 2;

    let countDesc = '';
    if (mode === 'single') {
        countDesc = `${results.length} 组  ×  1注/组  =  ${totalTickets} 注`;
    } else if (mode === 'multiple') {
        if (game === 'ssq') {
            countDesc = `${results.length} 组  ×  C(${form.multipleRedTotal},${config.redCount})×${form.multipleBlueTotal}  =  ${totalTickets} 注`;
        } else {
            countDesc = `${results.length} 组  ×  C(${form.multipleRedTotal},${config.redCount})×C(${form.multipleBlueTotal},${config.blueCount})  =  ${totalTickets} 注`;
        }
    } else {
        countDesc = `${results.length} 组  ×  C(${form.redTuoTotal},${config.redCount - form.redDanTotal})×…  =  ${totalTickets} 注`;
    }

    const subtotal = document.createElement('div');
    subtotal.className = 'receipt-subtotal';
    subtotal.textContent = countDesc;
    body.appendChild(subtotal);

    const totalLine = document.createElement('div');
    totalLine.className = 'receipt-total-line';
    totalLine.innerHTML = `<span>TOTAL</span><span>¥ ${totalCost.toFixed(2)}</span>`;
    body.appendChild(totalLine);

    receipt.appendChild(body);

    // 锯齿撕边
    const torn = document.createElement('div');
    torn.className = 'receipt-torn';
    receipt.appendChild(torn);

    wrapper.appendChild(receipt);
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
    actionBar.innerHTML = '<button class="generate-btn" data-action="generate-quick" type="button">开始生成</button>';
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
    subpageContent.innerHTML = '';

    if (quickState.step === 'start') {
        const card = document.createElement('div');
        card.className = 'auto-step-card';
        const gameName = LOTTERY_CONFIG[quickState.game].name;
        const killNote = quickState.game === 'ssq'
            ? '双色球只对红球做杀号，蓝球不受影响。'
            : '大乐透对红球和蓝球都做杀号。';
        card.innerHTML = `
            <h3 class="auto-step-title">第一步：生成杀号组</h3>
            <p class="auto-step-desc">点击「开始选号」后，系统自动生成 4 组${gameName}号码，以第 4 组为杀号组，从后续号码池中排除这些号码，再进行最终选号配置。</p>
            <p class="auto-step-desc">${killNote}</p>
            <button class="auto-start-btn" data-action="auto-start" type="button">开始选号</button>
        `;
        subpageContent.appendChild(card);

    } else if (quickState.step === 'kill') {
        const card = document.createElement('div');
        card.className = 'auto-step-card';
        card.innerHTML = `<h3 class="auto-step-title">第一步：杀号确认</h3>
            <p class="auto-step-desc">以下是自动生成的 4 组参考号码，第 4 组（标红）为杀号组，其号码将从后续球池中排除。</p>`;

        const groupsDiv = document.createElement('div');
        groupsDiv.className = 'auto-kill-groups';
        quickState.killGroups.forEach((group, idx) => {
            const row = document.createElement('div');
            const isKill = idx === 3;
            row.className = `auto-kill-group-row${isKill ? ' is-kill' : ''}`;
            const label = isKill ? '第4组 ★' : `第${idx + 1}组　`;
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
    modelNoteText.textContent = getModelDescription();

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

    homeView.classList.add('hidden');
    subpageView.classList.remove('hidden');
}

function goHome() {
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
            quickState.form.multipleRedTotal = Math.min(config.redMax, Math.max(config.redCount, value));
            break;
        case 'multipleBlueTotal':
            quickState.form.multipleBlueTotal = Math.min(config.blueMax, Math.max(config.blueCount, value));
            break;
        case 'redDanTotal':
            quickState.form.redDanTotal = Math.min(config.redCount - 1, Math.max(config.redDanMin, value));
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
    const killedRed  = (quickState && quickState.isAutoMode) ? quickState.killedRed  : new Set();
    const killedBlue = (quickState && quickState.isAutoMode) ? quickState.killedBlue : new Set();
    const redPool  = buildPool(config.redMax,  killedRed);
    const bluePool = buildPool(config.blueMax, killedBlue);
    const red  = simulatePhysicalDrawFromPool(redPool,  config.redCount).drawn;
    const blue = simulatePhysicalDrawFromPool(bluePool, config.blueCount).drawn;
    return {
        mode: 'single',
        red,
        blue,
        manual: { red: new Set(), blue: new Set() },
        summary: ''
    };
}

function generateMultipleTicket(game) {
    const config = LOTTERY_CONFIG[game];
    const killedRed  = (quickState && quickState.isAutoMode) ? [...quickState.killedRed]  : [];
    const killedBlue = (quickState && quickState.isAutoMode) ? [...quickState.killedBlue] : [];
    const redManual  = sortAsc([...quickState.custom.multipleRed]);
    const blueManual = sortAsc([...quickState.custom.multipleBlue]);
    const redRandomCount  = quickState.form.multipleRedTotal  - redManual.length;
    const blueRandomCount = quickState.form.multipleBlueTotal - blueManual.length;

    const redRandom  = drawRemaining(config.redMax,  [...redManual,  ...killedRed],  redRandomCount);
    const blueRandom = drawRemaining(config.blueMax, [...blueManual, ...killedBlue], blueRandomCount);

    return {
        mode: 'multiple',
        red:  sortAsc([...redManual,  ...redRandom]),
        blue: sortAsc([...blueManual, ...blueRandom]),
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
    const killedRed  = (quickState && quickState.isAutoMode) ? [...quickState.killedRed]  : [];
    const killedBlue = (quickState && quickState.isAutoMode) ? [...quickState.killedBlue] : [];
    const redDanManual  = sortAsc([...quickState.custom.redDan]);
    const redTuoManual  = sortAsc([...quickState.custom.redTuo]);
    const blueDanManual = sortAsc([...quickState.custom.blueDan]);
    const blueTuoManual = sortAsc([...quickState.custom.blueTuo]);

    const redDan = fillDanArea(config.redMax, redDanManual, [...redTuoManual, ...killedRed], quickState.form.redDanTotal);
    const redTuo = sortAsc([
        ...redTuoManual,
        ...drawRemaining(config.redMax, [...redDan, ...redTuoManual, ...killedRed], quickState.form.redTuoTotal - redTuoManual.length)
    ]);
    const blueDan = fillDanArea(config.blueMax, blueDanManual, [...blueTuoManual, ...killedBlue], quickState.form.blueDanTotal);
    const blueTuo = sortAsc([
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

function handleGenerateQuick() {
    if (!quickState) return;
    quickState.error = validateQuickState();
    if (quickState.error) {
        renderQuickPage();
        return;
    }

    const results = [];
    for (let i = 0; i < quickState.form.generateCount; i += 1) {
        if (quickState.mode === 'single') {
            results.push(generateSingleTicket(quickState.game));
        } else if (quickState.mode === 'multiple') {
            results.push(generateMultipleTicket(quickState.game));
        } else {
            results.push(generateDanTuoTicket(quickState.game));
        }
    }

    quickState.error = '';
    quickState.results = results;
    renderQuickPage();
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

backHomeBtn.addEventListener('click', goHome);

subpageContent.addEventListener('click', event => {
    // ── 自动选号：开始生成杀号 ──
    if (event.target.closest('[data-action="auto-start"]') && quickState && quickState.isAutoMode) {
        quickState.killGroups = [];
        for (let i = 0; i < 4; i++) {
            quickState.killGroups.push(generateLotteryByMachine(quickState.game));
        }
        const killGroup = quickState.killGroups[3];
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
    }
});

subpageContent.addEventListener('change', event => {
    const field = event.target.dataset.field;
    if (field && quickState) {
        updateQuickField(field, event.target.value);
    }
});
