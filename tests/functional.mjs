import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the unchanged extension in real Chromium, with real chrome.storage/i18n.
// Only the network-delivered player DOM is a controlled fixture. No real account,
// media, DRM, or live Crunchyroll selectors are exercised by these tests.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = await mkdtemp(path.join(os.tmpdir(), 'cr-auto-skip-test-'));
const results = [];
let context;
let popup;
let browserVersion;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="fixture"></main><script>window.clicks=[]</script></body></html>';
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
  finally {
    for (const page of context.pages()) if (page !== popup) await page.close();
  }
}
async function settings(values = {}) {
  await popup.evaluate(async values => {
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set({ enabled: true, skipRecaps: true, skipIntros: true,
      skipOutros: true, skipPreviews: true, skipDelay: 0, disableSkipHotkey: 'd', uiLanguage: 'en', ...values });
  }, values);
}
async function player(values = {}, url = 'https://www.crunchyroll.com/watch/fixture') {
  await settings(values);
  const page = await context.newPage();
  await page.goto(url);
  // Allow document_idle and asynchronous settings loading to finish first.
  await sleep(250);
  return page;
}
async function button(page, label, options = {}) {
  await page.evaluate(({ label, options }) => {
    const el = document.createElement(options.tag || 'button');
    el.id = options.id || 'skip';
    el.textContent = options.aria ? '' : label;
    if (options.aria) { el.setAttribute('aria-label', label); el.style.cssText = 'width:120px;height:40px'; }
    if (options.role) el.setAttribute('role', 'button');
    if (options.hidden) el.style.cssText = options.hidden;
    el.addEventListener('click', () => {
      window.clicks.push({ label, at: performance.now() });
      if (options.remove !== false) el.remove();
    });
    let parent = document.querySelector('#fixture') || document.body;
    if (options.shadow) {
      const host = document.createElement('div'); parent.append(host);
      parent = host.attachShadow({ mode: 'open' });
    }
    parent.append(el);
  }, { label, options });
}
async function clicks(page) { return page.evaluate(() => window.clicks.length); }
async function clicked(page, count = 1, timeout = 2500) {
  await page.waitForFunction(n => window.clicks.length >= n, count, { timeout });
  assert.equal(await clicks(page), count);
}
async function noClick(page, ms = 850) { await sleep(ms); assert.equal(await clicks(page), 0); }

try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  browserVersion = context.browser().version();
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (route.request().resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: fixture });
    return route.abort();
  });
  const admin = await context.newPage();
  await admin.goto('chrome://extensions');
  const extensions = await admin.evaluate(() => chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }));
  const extension = extensions.find(item => item.path === root);
  assert.ok(extension, 'Unpacked extension must really be loaded');
  assert.equal(extension.state, 'ENABLED');
  assert.equal(extension.manifestErrors.length, 0);
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extension.id}/popup.html`);
  await popup.waitForFunction(() => document.querySelector('h1').textContent === 'Crunchyroll Auto Skip');
  await admin.close();

  await test('Manifest V3 loads without install warnings', async () => {
    assert.equal(extension.installWarnings.length, 0);
    assert.equal(extension.version, JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')).version);
  });
  for (const [lang, labels] of Object.entries({
    en: ['Skip Recap', 'Skip Intro', 'Skip Credits', 'Skip Preview'],
    de: ['Zusammenfassung überspringen', 'Intro überspringen', 'Ending überspringen', 'Vorschau überspringen'],
    es: ['Omitir resumen', 'Omitir intro', 'Omitir créditos', 'Omitir avance'],
    fr: ['Passer le résumé', 'Passer intro', 'Passer le générique', 'Passer aperçu']
  })) {
    for (const label of labels) await test(`Recognizes ${lang}: ${label}`, async () => {
      const p = await player(); await button(p, label); await clicked(p);
    });
  }
  for (const [key, label] of Object.entries({ skipRecaps: 'Skip Recap', skipIntros: 'Skip Intro', skipOutros: 'Skip Credits', skipPreviews: 'Skip Preview' })) {
    await test(`${key}=false prevents clicking`, async () => {
      const p = await player({ [key]: false }); await button(p, label); await noClick(p);
    });
  }
  await test('Master off prevents new skips', async () => {
    const p = await player({ enabled: false }); await button(p, 'Skip Intro'); await noClick(p);
  });
  for (const style of ['display:none', 'visibility:hidden', 'opacity:0', 'pointer-events:none']) {
    await test(`Hidden/unavailable control ignored: ${style}`, async () => {
      const p = await player(); await button(p, 'Skip Recap', { hidden: style }); await noClick(p);
    });
  }
  await test('ARIA-labelled role button recognized', async () => {
    const p = await player(); await button(p, 'Skip Recap', { tag: 'div', role: true, aria: true }); await clicked(p);
  });
  await test('Accessible shadow-root control recognized', async () => {
    const p = await player(); await button(p, 'Skip Recap', { shadow: true }); await clicked(p);
  });
  for (const label of ['Skip Intro', 'Skip Credits']) {
    await test(`${label} respects nonzero delay`, async () => {
      const p = await player({ skipDelay: 1 }); await button(p, label);
      await noClick(p, 400); await clicked(p);
    });
  }
  for (const label of ['Skip Recap', 'Skip Preview']) {
    await test(`${label} ignores intro/outro delay`, async () => {
      const p = await player({ skipDelay: 10 }); await button(p, label); await clicked(p, 1, 1500);
    });
  }
  await test('Detached delayed control is not clicked', async () => {
    const p = await player({ skipDelay: 1 }); await button(p, 'Skip Intro');
    await sleep(200); await p.locator('#skip').evaluate(el => el.remove()); await noClick(p, 1200);
  });
  await test('Master off cancels an already pending skip', async () => {
    const p = await player({ skipDelay: 1 }); await button(p, 'Skip Intro'); await sleep(200);
    await popup.evaluate(() => chrome.storage.sync.set({ enabled: false })); await noClick(p, 1200);
  });
  await test('Segment off cancels an already pending skip', async () => {
    const p = await player({ skipDelay: 1 }); await button(p, 'Skip Intro'); await sleep(200);
    await popup.evaluate(() => chrome.storage.sync.set({ skipIntros: false })); await noClick(p, 1200);
  });
  await test('Hotkey cancels pending intro skip', async () => {
    const p = await player({ skipDelay: 1 }); await button(p, 'Skip Intro'); await sleep(200);
    await p.keyboard.press('d'); await noClick(p, 1300);
  });
  await test('Customized hotkey cancels pending skip', async () => {
    const p = await player({ skipDelay: 1, disableSkipHotkey: 'x' }); await button(p, 'Skip Intro');
    await sleep(200); await p.keyboard.press('x'); await noClick(p, 1300);
  });
  for (const kind of ['input', 'textarea', 'contenteditable']) {
    await test(`Hotkey ignored in ${kind}`, async () => {
      const p = await player({ skipDelay: 1 });
      await p.evaluate(kind => {
        const el = document.createElement(kind === 'contenteditable' ? 'div' : kind);
        if (kind === 'contenteditable') el.contentEditable = 'true';
        el.id = 'editor'; document.body.append(el); el.focus();
      }, kind);
      await button(p, 'Skip Intro'); await sleep(200); await p.keyboard.press('d'); await clicked(p);
    });
  }
  await test('Modified hotkey does not cancel skip', async () => {
    const p = await player({ skipDelay: 1 }); await button(p, 'Skip Intro'); await sleep(200);
    await p.keyboard.press('Control+d'); await clicked(p);
  });
  await test('Hotkey suppression resets when control disappears', async () => {
    const p = await player({ skipDelay: 1 }); await button(p, 'Skip Intro'); await sleep(200);
    await p.keyboard.press('d'); await p.locator('#skip').evaluate(el => el.remove()); await sleep(850);
    await button(p, 'Skip Intro'); await clicked(p);
  });
  await test('Same control is throttled for 2.5 seconds', async () => {
    const p = await player(); await button(p, 'Skip Recap', { remove: false }); await clicked(p);
    await sleep(1500); assert.equal(await clicks(p), 1); await clicked(p, 2, 2500);
  });
  await test('Stored setting changes reach an open player', async () => {
    const p = await player({ enabled: false }); await button(p, 'Skip Recap'); await noClick(p);
    await popup.evaluate(() => chrome.storage.sync.set({ enabled: true })); await clicked(p);
  });
  await test('SPA navigation from home to watch starts skipping', async () => {
    const p = await player({}, 'https://www.crunchyroll.com/');
    await button(p, 'Skip Recap'); await noClick(p);
    await p.evaluate(() => history.pushState({}, '', '/watch/next')); await clicked(p);
  });
  await test('SPA navigation away cancels pending timer', async () => {
    const p = await player({ skipDelay: 1 }); await button(p, 'Skip Intro'); await sleep(200);
    await p.evaluate(() => history.pushState({}, '', '/home')); await noClick(p, 1300);
  });
  await test('SPA episode change resets hotkey suppression', async () => {
    const p = await player({ skipDelay: 1 }); await button(p, 'Skip Intro'); await sleep(200); await p.keyboard.press('d');
    // Replacement and URL change occur in one task, like a player re-render.
    await p.evaluate(() => {
      history.pushState({}, '', '/watch/next');
      const old = document.querySelector('#skip'); const next = old.cloneNode(true);
      next.addEventListener('click', () => { window.clicks.push({ label: 'Skip Intro', at: performance.now() }); next.remove(); });
      old.replaceWith(next);
    }); await clicked(p, 1, 2400);
  });
  await test('Unrelated preview-labelled control is not clicked', async () => {
    const p = await player(); await button(p, 'Open preview details'); await noClick(p);
  });
  await test('Plain preview text does not seek the video', async () => {
    const p = await player();
    await p.evaluate(() => {
      document.body.append(Object.assign(document.createElement('p'), { textContent: 'Next episode preview' }));
      const video = document.createElement('video'); video.id = 'video'; document.body.append(video);
      window.seeks = 0; Object.defineProperty(video, 'currentTime', { get: () => 1200, set: () => window.seeks++ });
    });
    await sleep(1000); assert.equal(await p.evaluate(() => window.seeks), 0);
  });
  await test('Static player frame without watch in URL can skip', async () => {
    const p = await player();
    await p.evaluate(() => { const f = document.createElement('iframe'); f.src = 'https://static.crunchyroll.com/player'; document.body.append(f); });
    const f = await p.waitForSelector('iframe'); const frame = await f.contentFrame(); await frame.waitForSelector('#fixture', { state: 'attached' });
    await button(frame, 'Skip Recap'); await clicked(frame, 1, 1500);
  });
  await test('Matched static frame with watch in URL skips', async () => {
    const p = await player();
    await p.evaluate(() => { const f = document.createElement('iframe'); f.src = 'https://static.crunchyroll.com/watch/fixture'; document.body.append(f); });
    const frame = await (await p.waitForSelector('iframe')).contentFrame(); await frame.waitForSelector('#fixture', { state: 'attached' });
    await sleep(250); await button(frame, 'Skip Recap'); await clicked(frame);
  });
  await test('Non-Crunchyroll pages do not run skip logic', async () => {
    const p = await player({}, 'https://example.com/watch/fixture'); await button(p, 'Skip Recap'); await noClick(p);
  });
  await test('Popup master switch disables segment controls and persists', async () => {
    await settings(); await popup.reload(); await popup.waitForFunction(() => document.querySelector('#enabled').checked);
    await popup.locator("label[for='enabled']").click();
    for (const id of ['skipRecaps', 'skipIntros', 'skipOutros', 'skipPreviews']) assert.equal(await popup.locator(`#${id}`).isDisabled(), true);
    await popup.reload(); await popup.waitForFunction(() => document.querySelector('#skipRecaps').disabled);
    assert.equal(await popup.locator('#enabled').isChecked(), false);
  });
  await test('Popup advanced section opens and closes without errors', async () => {
    await settings(); await popup.reload(); await popup.waitForFunction(() => document.querySelector('h1').textContent === 'Crunchyroll Auto Skip');
    const errors = []; const handler = error => errors.push(error.message); popup.on('pageerror', handler);
    try {
      await popup.locator('#advancedToggle').click(); assert.equal(await popup.locator('#advancedContent').evaluate(el => el.classList.contains('collapsed')), false);
      await popup.locator('#advancedToggle').click(); assert.equal(await popup.locator('#advancedContent').evaluate(el => el.classList.contains('collapsed')), true);
      assert.deepEqual(errors, []);
    } finally { popup.off('pageerror', handler); }
  });
  for (const lang of ['en', 'de', 'es', 'fr']) {
    await test(`Popup ${lang} translates every mapped element`, async () => {
      await settings({ uiLanguage: lang }); await popup.reload();
      const messages = JSON.parse(await readFile(path.join(root, '_locales', lang, 'messages.json'), 'utf8'));
      await popup.waitForFunction(expected => document.querySelector('h1').textContent === expected, messages.extName.message);
      assert.equal(await popup.locator('#advancedToggle').textContent(), messages.advanced.message);
      assert.equal(await popup.locator("label[for='enabled'] .label").textContent(), messages.masterSwitch.message);
      assert.equal(await popup.locator('.section-title').first().textContent(), messages.segmentControls.message);
      assert.equal(await popup.locator('body').textContent().then(text => /__MSG_/.test(text)), false);
    });
  }
  await test('Popup language selection persists across reload', async () => {
    await settings(); await popup.reload(); await popup.waitForFunction(() => document.querySelector('#language').value === 'en');
    await popup.locator('#advancedToggle').click(); await popup.locator('#language').selectOption('de');
    await popup.reload(); await popup.waitForFunction(() => document.querySelector('#language').value === 'de');
    assert.equal(await popup.evaluate(async () => (await chrome.storage.sync.get('uiLanguage')).uiLanguage), 'de');
  });
  await test('Popup preserves a saved zero-second delay', async () => {
    await settings({ skipDelay: 0 }); await popup.reload(); await popup.waitForFunction(() => document.querySelector('#enabled').checked);
    assert.equal(await popup.locator('#skipDelay').inputValue(), '0');
  });
  await test('Popup delay slider persists chosen value', async () => {
    await settings(); await popup.reload(); await popup.waitForFunction(() => document.querySelector('#enabled').checked);
    await popup.locator('#skipDelay').evaluate(el => { el.value = '7'; el.dispatchEvent(new Event('change')); });
    assert.equal(await popup.evaluate(async () => (await chrome.storage.sync.get('skipDelay')).skipDelay), 7);
  });
  await test('Popup custom hotkey is persisted lowercase', async () => {
    await settings(); await popup.reload(); await popup.waitForFunction(() => document.querySelector('#enabled').checked);
    await popup.locator('#hotkeyInput').evaluate(el => { el.value = 'X'; el.dispatchEvent(new Event('change')); });
    assert.equal(await popup.evaluate(async () => (await chrome.storage.sync.get('disableSkipHotkey')).disableSkipHotkey), 'x');
    assert.equal(await popup.locator('#hotkeyInput').inputValue(), 'X');
  });
  await test('Popup shortcut help reflects customized hotkey', async () => {
    await settings({ disableSkipHotkey: 'x' }); await popup.reload(); await popup.waitForFunction(() => document.querySelector('#hotkeyInput').value === 'X');
    assert.match(await popup.locator('.info-box .help').textContent(), /['"]X['"]|['"]x['"]/);
  });
  await test('Nested editable descendant does not trigger hotkey override', async () => {
    const p = await player({ skipDelay: 1 });
    await button(p, 'Skip Intro'); await sleep(200);
    await p.evaluate(() => {
      const editor = document.createElement('div'); editor.contentEditable = 'true';
      const span = document.createElement('span'); span.textContent = 'typing'; editor.append(span); document.body.append(editor);
      span.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true }));
    });
    await clicked(p);
  });
  await test('About:blank child frame can skip inherited-host controls', async () => {
    const p = await player();
    await p.evaluate(() => { const f = document.createElement('iframe'); document.body.append(f); });
    const frame = await (await p.waitForSelector('iframe')).contentFrame(); await sleep(250);
    await frame.evaluate(() => { window.clicks = []; }); await button(frame, 'Skip Recap'); await clicked(frame, 1, 1500);
  });
  await test('Visible control is recognized after initially being hidden', async () => {
    const p = await player(); await button(p, 'Skip Recap', { hidden: 'display:none' }); await noClick(p, 300);
    await p.locator('#skip').evaluate(el => el.style.display = 'block'); await clicked(p);
  });
  await test('Uppercase hotkey cancels pending skip', async () => {
    const p = await player({ skipDelay: 1 }); await button(p, 'Skip Intro'); await sleep(200);
    await p.keyboard.press('Shift+D'); await noClick(p, 1300);
  });
  await test('Locale files share the same translation keys', async () => {
    const locales = await Promise.all(['en', 'de', 'es', 'fr'].map(async lang => JSON.parse(await readFile(path.join(root, '_locales', lang, 'messages.json'), 'utf8'))));
    for (const locale of locales) {
      assert.deepEqual(Object.keys(locale).sort(), Object.keys(locales[0]).sort());
      for (const value of Object.values(locale)) assert.ok(typeof value.message === 'string' && value.message.length);
    }
  });
  await test('Popup segment switches all persist and reload', async () => {
    await settings(); await popup.reload(); await popup.waitForFunction(() => document.querySelector('#enabled').checked);
    for (const key of ['skipRecaps', 'skipIntros', 'skipOutros', 'skipPreviews']) {
      await popup.locator(`label[for='${key}']`).click();
      assert.equal(await popup.evaluate(async key => (await chrome.storage.sync.get(key))[key], key), false);
    }
    await popup.reload(); await popup.waitForFunction(() => document.querySelector('#enabled').checked);
    for (const key of ['skipRecaps', 'skipIntros', 'skipOutros', 'skipPreviews']) assert.equal(await popup.locator(`#${key}`).isChecked(), false);
  });
  await test('SPA replaceState starts player', async () => {
    const p = await player({}, 'https://www.crunchyroll.com/'); await button(p, 'Skip Recap');
    await p.evaluate(() => history.replaceState({}, '', '/watch/next')); await clicked(p);
  });
  await test('Empty storage loads default toggles, delay and hotkey', async () => {
    await popup.evaluate(() => chrome.storage.sync.clear()); await popup.reload();
    await popup.waitForFunction(() => document.querySelector('#enabled').checked);
    for (const key of ['enabled', 'skipRecaps', 'skipIntros', 'skipOutros', 'skipPreviews']) assert.equal(await popup.locator(`#${key}`).isChecked(), true);
    assert.equal(await popup.locator('#skipDelay').inputValue(), '3'); assert.equal(await popup.locator('#hotkeyInput').inputValue(), 'D');
  });
  await test('Popup repository link opens the correct GitHub URL', async () => {
    const promise = context.waitForEvent('page'); await popup.locator('#githubLink').click();
    const tab = await promise; await tab.waitForURL('https://github.com/mischiminator/Chrunchroll-auto-skip');
  });
} finally {
  if (context) await context.close();
  await rm(profile, { recursive: true, force: true });
}
const summary = {
  browser: browserVersion,
  scope: 'Actual unpacked extension; real Chromium DOM and extension APIs; routed player fixtures, not live playback',
  passed: results.filter(r => r.status === 'PASS').length,
  failed: results.filter(r => r.status === 'FAIL').length,
  total: results.length,
  results
};
await mkdir(path.join(root, 'test-results'), { recursive: true });
await writeFile(path.join(root, 'test-results', 'functional.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`\n${summary.passed}/${summary.total} passed; ${summary.failed} failed`);
process.exitCode = summary.failed ? 1 : 0;
