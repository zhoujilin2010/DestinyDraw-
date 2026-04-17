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
    }
};

const QUICK_PAGE_KEYS    = new Set(['ssq-quick', 'dlt-quick']);
const AUTO_PAGE_KEYS     = new Set(['ssq-auto',  'dlt-auto']);
const LIFE_SIM_PAGE_KEYS = new Set(['dlt-when']);

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

    if (LIFE_SIM_PAGE_KEYS.has(pageKey)) {
        // 废弃默认的「统一随机模型」说明栏（life-sim 有自己的 UI）
        modelNoteText.textContent = '';
        const modelNoteEl = document.querySelector('.model-note');
        if (modelNoteEl) modelNoteEl.style.display = 'none';
        quickState = null;
        lifeSimState = createLifeSimState();
        renderLifeSimPage();
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

