/**
 * fetch-data.js
 * 服务端抓取双色球/大乐透历史开奖数据，输出到 data/ 目录
 * 用法：node scripts/fetch-data.js
 * 由 GitHub Actions 每日自动运行，也可本地手动执行
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

function fetchJson(url, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const options = { headers: { ...HEADERS, ...extraHeaders } };
        const makeReq = (reqUrl, depth = 0) => {
            if (depth > 5) { reject(new Error('Too many redirects')); return; }
            const req = https.get(reqUrl, options, (res) => {
                // 自动跟随重定向
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    const next = res.headers.location.startsWith('http')
                        ? res.headers.location
                        : new URL(res.headers.location, reqUrl).href;
                    console.log(`    Redirect ${res.statusCode}: ${reqUrl} → ${next}`);
                    return makeReq(next, depth + 1);
                }
                if (res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode} for ${reqUrl}`));
                    res.resume();
                    return;
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch(e) { reject(new Error(`Parse error: ${data.substring(0, 80)}`)); }
                });
            });
            req.on('error', reject);
            req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${reqUrl}`)); });
        };
        makeReq(url, 0);
    });
}

async function fetchSSQ() {
    console.log('  Fetching SSQ from cwl.gov.cn ...');
    const json = await fetchJson(
        'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=500',
        { 'Referer': 'https://www.cwl.gov.cn/' }
    );
    if (!json.result || !Array.isArray(json.result)) throw new Error('SSQ: unexpected response');
    return json.result.map(item => ({
        code: String(item.code),
        date: item.date,
        red:  item.red.split(',').map(Number),
        blue: [Number(item.blue)]
    }));
}

async function fetchDLT() {
    console.log('  Fetching DLT from sporttery.cn (3 pages) ...');
    const seen  = new Set();
    const draws = [];
    for (let p = 1; p <= 5; p++) {
        const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.do?gameNo=85&provinceId=0&pageSize=100&isVerify=1&pageNo=${p}`;
        let json;
        try {
            json = await fetchJson(url, { 'Referer': 'https://www.sporttery.cn/dlt/kjgg/' });
        } catch(e) {
            console.log(`  Page ${p}: fetch error - ${e.message}`);
            break;
        }
        if (!json.success || !json.value || !json.value.list) {
            console.log(`  Page ${p}: API returned success=false, errorCode=${json.errorCode}, msg=${json.errorMessage}`);
            break;
        }
        const list = json.value.list;
        if (list.length === 0) { console.log(`  Page ${p}: empty list`); break; }
        for (const item of list) {
            if (seen.has(item.lotteryDrawNum)) continue;
            seen.add(item.lotteryDrawNum);
            const parts = item.lotteryDrawResult.trim().split(/\s+/).map(Number);
            draws.push({
                code: String(item.lotteryDrawNum),
                date: item.lotteryDrawTime,
                red:  parts.slice(0, 5),
                blue: parts.slice(5)
            });
        }
        console.log(`  Page ${p}: +${list.length} draws (total ${draws.length})`);
        if (p < 5) await new Promise(r => setTimeout(r, 500));
    }
    return draws;
}

async function main() {
    let success = 0;

    console.log('[SSQ]');
    try {
        const draws = await fetchSSQ();
        const store = { draws, updatedAt: Date.now() };
        fs.writeFileSync(path.join(DATA_DIR, 'ssq.json'), JSON.stringify(store));
        console.log(`  ✓ Saved ${draws.length} periods → data/ssq.json`);
        success++;
    } catch(e) {
        console.error(`  ✗ SSQ failed: ${e.message}`);
    }

    console.log('[DLT]');
    try {
        const draws = await fetchDLT();
        const store = { draws, updatedAt: Date.now() };
        fs.writeFileSync(path.join(DATA_DIR, 'dlt.json'), JSON.stringify(store));
        console.log(`  ✓ Saved ${draws.length} periods → data/dlt.json`);
        success++;
    } catch(e) {
        console.error(`  ✗ DLT failed: ${e.message}`);
    }

    console.log(`\nDone: ${success}/2 successful`);
    if (success === 0) process.exit(1);
}

main();
