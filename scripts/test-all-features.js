const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

    await page.goto('file:///d:/中大奖/index.html');
    await page.waitForTimeout(1000);

    const cards = await page.$$('.nav-card');
    console.log('Nav cards found:', cards.length);

    const pageKeys = await page.$$eval('.nav-card', cs => cs.map(c => c.dataset.page));
    console.log('Page keys:', pageKeys.join(', '));

    for (const key of pageKeys) {
        await page.click('[data-page="' + key + '"]');
        await page.waitForTimeout(600);
        const title = await page.$eval('#subpageTitle', el => el.textContent);
        console.log('Opened:', key, '=>', title);
        await page.click('#backHomeBtn');
        await page.waitForTimeout(400);
    }

    console.log('JS Errors:', errors.length ? errors : 'none');
    await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
