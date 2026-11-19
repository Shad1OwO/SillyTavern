/* global toastr */
import { test, expect } from '@playwright/test';
import { testSetup } from './frontent-test-utils.js';

/**
 * Sets the interface style and basic mode through the module API.
 * @param {import('@playwright/test').Page} page
 * @param {string} style
 * @param {boolean} basic
 */
async function setModes(page, style, basic = false) {
    await page.evaluate(async ([s, b]) => {
        const ux = await import('./scripts/ux/ux-modes.js');
        ux.setUiStyle(s);
        ux.setBasicSettings(b);
        const { saveSettings } = await import('./script.js');
        await saveSettings();
    }, [style, basic]);
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
async function bodyUxClasses(page) {
    return page.evaluate(() => [...document.body.classList].filter(c => c.startsWith('ux-')));
}

test.describe('Interface styles', () => {
    test.beforeEach(testSetup.awaitST);
    test.afterEach(async ({ page }) => {
        await setModes(page, 'classic', false).catch(() => { });
    });

    test('defaults to classic', async ({ page }) => {
        await setModes(page, 'classic', false);
        await page.reload();
        await page.waitForFunction('document.getElementById("preloader") === null', { timeout: 0 });
        const state = await page.evaluate(async () => {
            const { power_user } = await import('./scripts/power-user.js');
            return { style: power_user.ui_style, basic: power_user.ui_basic_settings };
        });
        expect(state).toEqual({ style: 'classic', basic: false });
        expect(await bodyUxClasses(page)).toEqual([]);
    });

    test('style switch applies instantly', async ({ page }) => {
        await page.locator('#user-settings-button .drawer-toggle').click();
        await page.locator('#ux_style_switch [data-ux-style="enhanced"]').click();
        expect(await bodyUxClasses(page)).toEqual(['ux-enhanced']);
        expect(await page.evaluate(async () => (await import('./scripts/power-user.js')).power_user.ui_style)).toBe('enhanced');
        await page.locator('#ux_style_switch [data-ux-style="sidebar"]').click();
        expect(await bodyUxClasses(page)).toEqual(['ux-sidebar']);
        await expect(page.locator('#ux_style_switch [data-ux-style="sidebar"]')).toHaveClass(/active/);
    });

    test('slash commands switch style and basic mode', async ({ page }) => {
        const run = (cmd) => page.evaluate(async (c) => {
            const { executeSlashCommandsWithOptions } = await import('./scripts/slash-commands.js');
            return (await executeSlashCommandsWithOptions(c)).pipe;
        }, cmd);
        await run('/ui-style sidebar');
        expect(await bodyUxClasses(page)).toContain('ux-sidebar');
        await run('/ui-basic toggle');
        expect(await bodyUxClasses(page)).toContain('ux-basic');
        await run('/ui-style bogus');
        expect(await bodyUxClasses(page)).toContain('ux-sidebar');
        expect(await run('/ui-style')).toBe('sidebar');
        expect(await run('/ui-basic')).toBe('on');
    });

    test('classic layout is unchanged by the new stylesheet', async ({ page }) => {
        const measure = () => page.evaluate(() => {
            const r = document.getElementById('top-settings-holder').getBoundingClientRect();
            const s = document.getElementById('sheld').getBoundingClientRect();
            return [r.x, r.y, r.width, r.height, s.x, s.y, s.width, s.height];
        });
        const withSheet = await measure();
        await page.evaluate(() => {
            for (const sheet of document.styleSheets) {
                for (const rule of sheet.cssRules ?? []) {
                    if (rule instanceof CSSImportRule && rule.href.includes('ux-modes.css')) {
                        rule.styleSheet.disabled = true;
                    }
                }
            }
            document.querySelectorAll('.uxDrawerLabel, .uxStyleSwitch, .uxBasicSwitch').forEach(e => e.remove());
        });
        expect(await measure()).toEqual(withSheet);
    });
});

test.describe('Enhanced style', () => {
    test.beforeEach(testSetup.awaitST);
    test.afterEach(async ({ page }) => {
        await page.evaluate(async () => {
            const { power_user } = await import('./scripts/power-user.js');
            power_user.toastr_position = 'toast-top-center';
            toastr.options.positionClass = 'toast-top-center';
            document.getElementById('test-ext')?.remove();
        }).catch(() => { });
        await setModes(page, 'classic', false).catch(() => { });
    });

    test('labels every top bar drawer', async ({ page }) => {
        await setModes(page, 'enhanced');
        const counts = await page.evaluate(() => ({
            drawers: document.querySelectorAll('#top-settings-holder > .drawer').length,
            labels: document.querySelectorAll('#top-settings-holder > .drawer .uxDrawerLabel').length,
        }));
        expect(counts.labels).toBe(counts.drawers);
        await expect(page.locator('#sys-settings-button .uxDrawerLabel')).toHaveText('API');
        await expect(page.locator('#sys-settings-button .uxDrawerLabel')).toBeVisible();
    });

    test('labels drawers added by extensions', async ({ page }) => {
        await setModes(page, 'enhanced');
        await page.evaluate(() => {
            document.getElementById('top-settings-holder').insertAdjacentHTML('beforeend',
                '<div class="drawer" id="test-ext"><div class="drawer-toggle"><div class="drawer-icon fa-solid fa-star" title="My Ext"></div></div></div>');
        });
        await expect(page.locator('#test-ext .uxDrawerLabel')).toHaveText('My Ext');
    });

    test('classic hides labels', async ({ page }) => {
        await setModes(page, 'enhanced');
        await setModes(page, 'classic');
        const displays = await page.evaluate(() => [...document.querySelectorAll('.uxDrawerLabel')].map(e => getComputedStyle(e).display));
        expect(displays.length).toBeGreaterThan(0);
        expect(new Set(displays)).toEqual(new Set(['none']));
    });

    test('default toast position moves out of the way', async ({ page }) => {
        await setModes(page, 'enhanced');
        const state = await page.evaluate(async () => {
            const { power_user } = await import('./scripts/power-user.js');
            return { runtime: toastr.options.positionClass, saved: power_user.toastr_position };
        });
        expect(state).toEqual({ runtime: 'toast-bottom-right', saved: 'toast-top-center' });
        await setModes(page, 'classic');
        expect(await page.evaluate(() => toastr.options.positionClass)).toBe('toast-top-center');
    });

    test('custom toast position is kept', async ({ page }) => {
        await page.evaluate(async () => {
            const { power_user } = await import('./scripts/power-user.js');
            power_user.toastr_position = 'toast-top-left';
            toastr.options.positionClass = 'toast-top-left';
        });
        await setModes(page, 'enhanced');
        expect(await page.evaluate(() => toastr.options.positionClass)).toBe('toast-top-left');
    });

    test('top bar fits on a phone screen', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await setModes(page, 'enhanced');
        const edges = await page.evaluate(() => [...document.querySelectorAll('#top-settings-holder > .drawer')]
            .filter(d => getComputedStyle(d).display !== 'none')
            .map(d => d.getBoundingClientRect())
            .map(r => [Math.floor(r.left), Math.ceil(r.right)]));
        expect(Math.min(...edges.map(e => e[0]))).toBeGreaterThanOrEqual(0);
        expect(Math.max(...edges.map(e => e[1]))).toBeLessThanOrEqual(375);
    });

    test('drawers still open', async ({ page }) => {
        await setModes(page, 'enhanced');
        await page.locator('#sys-settings-button .drawer-toggle').click();
        await expect(page.locator('#rm_api_block')).toBeVisible();
        await expect(page.locator('#rm_api_block')).toHaveClass(/openDrawer/);
    });
});

test.describe('Search everywhere', () => {
    test.beforeEach(testSetup.awaitST);
    test.afterEach(async ({ page }) => {
        await setModes(page, 'classic', false).catch(() => { });
    });

    test('finds settings in other panels', async ({ page }) => {
        const results = await page.evaluate(async () => {
            const s = await import('./scripts/ux/ux-search.js');
            return s.searchSettings(s.buildSettingsIndex(), 'temperature').map(r => ({ label: r.label, panel: r.panel }));
        });
        expect(results.length).toBeGreaterThan(0);
        expect(results.some(r => r.panel === 'AI Settings')).toBe(true);
    });

    test('ranks prefix matches first', async ({ page }) => {
        const first = await page.evaluate(async () => {
            const s = await import('./scripts/ux/ux-search.js');
            return s.searchSettings(s.buildSettingsIndex(), 'tem')[0]?.label;
        });
        expect(first?.toLowerCase().startsWith('tem')).toBe(true);
    });

    test('reveals a setting inside a collapsed section of a closed drawer', async ({ page }) => {
        const state = await page.evaluate(async () => {
            const s = await import('./scripts/ux/ux-search.js');
            const el = document.getElementById('auto_swipe_minimum_length');
            const content = el.closest('.inline-drawer-content');
            content.style.display = 'none';
            await s.revealSetting(el);
            await new Promise(r => setTimeout(r, 800));
            const rect = el.getBoundingClientRect();
            return {
                drawerOpen: document.getElementById('user-settings-block').classList.contains('openDrawer'),
                sectionShown: getComputedStyle(content).display !== 'none',
                inView: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.height > 0,
                flashed: el.classList.contains('uxFlash') || !!el.closest('.uxFlash'),
            };
        });
        expect(state).toEqual({ drawerOpen: true, sectionShown: true, inView: true, flashed: true });
    });

    test('hotkey opens search outside classic only', async ({ page }) => {
        await page.keyboard.press('Control+k');
        await expect(page.locator('.popup input.uxSearchInput')).toHaveCount(0);
        await setModes(page, 'enhanced');
        await page.locator('body').click({ position: { x: 5, y: 400 } });
        await page.keyboard.press('Control+k');
        await expect(page.locator('.popup input.uxSearchInput')).toBeFocused();
    });

    test('choosing a result opens its panel', async ({ page }) => {
        await setModes(page, 'enhanced');
        await page.locator('#ux_search_button .drawer-toggle').click();
        await page.locator('.popup input.uxSearchInput').fill('auto-swipe');
        await page.keyboard.press('Enter');
        await expect(page.locator('#user-settings-block')).toHaveClass(/openDrawer/);
    });
});

test.describe('Getting started', () => {
    test.beforeEach(testSetup.awaitST);
    test.afterEach(async ({ page }) => {
        await page.evaluate(async () => {
            const { power_user } = await import('./scripts/power-user.js');
            power_user.ui_checklist_dismissed = false;
            const { setOnlineStatus } = await import('./script.js');
            setOnlineStatus('no_connection');
        }).catch(() => { });
        await setModes(page, 'classic', false).catch(() => { });
    });

    /** @param {import('@playwright/test').Page} page */
    async function renderInto(page) {
        await page.evaluate(async () => {
            const { renderGettingStarted } = await import('./scripts/ux/ux-checklist.js');
            document.getElementById('test-gs')?.remove();
            const root = document.createElement('div');
            root.id = 'test-gs';
            root.classList.add('uxGettingStarted');
            document.getElementById('chat').prepend(root);
            renderGettingStarted(root);
        });
    }

    test('style picker shows on the welcome panel in classic, without checklist', async ({ page }) => {
        await renderInto(page);
        await expect(page.locator('#test-gs .uxStyleSwitch')).toBeVisible();
        await expect(page.locator('#test-gs .uxChecklist')).toHaveCount(0);
    });

    test('welcome panel template has a mount point', async ({ page }) => {
        await page.evaluate(async () => {
            const { openWelcomeScreen } = await import('./scripts/welcome-screen.js');
            await openWelcomeScreen({ force: true });
        });
        await expect(page.locator('#chat .welcomePanel .uxGettingStarted .uxStyleSwitch').first()).toBeVisible();
    });

    test('checklist tracks API connection', async ({ page }) => {
        await setModes(page, 'enhanced');
        await page.evaluate(async () => {
            const { setOnlineStatus } = await import('./script.js');
            setOnlineStatus('no_connection');
        });
        await renderInto(page);
        const step = page.locator('#test-gs .uxChecklist [data-step="api"]');
        await expect(step).not.toHaveClass(/done/);
        await page.evaluate(async () => {
            const { setOnlineStatus } = await import('./script.js');
            setOnlineStatus('Connected');
        });
        await expect(step).toHaveClass(/done/);
    });

    test('dismiss hides checklist and persists', async ({ page }) => {
        await setModes(page, 'enhanced');
        await renderInto(page);
        await page.locator('#test-gs .uxChecklistDismiss').click();
        await expect(page.locator('#test-gs .uxChecklist')).toHaveCount(0);
        expect(await page.evaluate(async () => (await import('./scripts/power-user.js')).power_user.ui_checklist_dismissed)).toBe(true);
    });
});

test.describe('Sidebar style', () => {
    test.beforeEach(testSetup.awaitST);
    test.afterEach(async ({ page }) => {
        await page.evaluate(() => {
            const pin = /** @type {HTMLInputElement} */ (document.getElementById('lm_button_panel_pin'));
            if (pin.checked) pin.click();
        }).catch(() => { });
        await setModes(page, 'classic', false).catch(() => { });
    });

    test('rail on the left on desktop', async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 800 });
        await setModes(page, 'sidebar');
        const box = await page.locator('#top-settings-holder').boundingBox();
        expect(box.x).toBe(0);
        expect(Math.abs(box.width - 84)).toBeLessThanOrEqual(2);
        expect(Math.abs(box.height - 800)).toBeLessThanOrEqual(2);
        const sheld = await page.locator('#sheld').boundingBox();
        expect(sheld.x).toBeGreaterThanOrEqual(84);
    });

    test('pinned AI panel does not overlap the rail', async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 800 });
        await setModes(page, 'sidebar');
        await page.locator('#ai-config-button .drawer-toggle').click();
        await page.locator('label[for="lm_button_panel_pin"]').click();
        await expect(page.locator('#left-nav-panel')).toBeVisible();
        const panel = await page.locator('#left-nav-panel').boundingBox();
        expect(panel.x).toBeGreaterThanOrEqual(84);
    });

    test('a regular drawer opens beside the rail', async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 800 });
        await setModes(page, 'sidebar');
        await page.locator('#sys-settings-button .drawer-toggle').click();
        await expect(page.locator('#rm_api_block')).toBeVisible();
        const panel = await page.locator('#rm_api_block').boundingBox();
        expect(panel.x).toBeGreaterThanOrEqual(84);
    });

    test('falls back to top bar on phones', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await setModes(page, 'sidebar');
        const box = await page.locator('#top-settings-holder').boundingBox();
        expect(box.y).toBeLessThanOrEqual(1);
        expect(box.width).toBeGreaterThan(300);
    });
});

test.describe('Basic settings', () => {
    test.beforeEach(testSetup.awaitST);
    test.beforeEach(async ({ page }) => {
        // Use a text completion backend so the full sampler list is present.
        await page.evaluate(() => {
            $('#main_api').val('textgenerationwebui').trigger('change');
            $('#textgen_type').val('koboldcpp').trigger('change');
        });
        await page.locator('#ai-config-button .drawer-toggle').click();
        await expect(page.locator('#left-nav-panel')).toBeVisible();
    });
    test.afterEach(async ({ page }) => {
        await page.evaluate(() => $('#main_api').val('koboldhorde').trigger('change')).catch(() => { });
        await setModes(page, 'classic', false).catch(() => { });
    });

    test('hides mirostat and keeps temperature', async ({ page }) => {
        await expect(page.locator('#mirostat_block_ooba')).toBeVisible();
        await page.locator('#ux_basic_switch .uxBasicSwitch').click();
        await expect(page.locator('#mirostat_block_ooba')).toBeHidden();
        await expect(page.locator('#temp_textgenerationwebui')).toBeVisible();
        await expect(page.locator('#min_p_textgenerationwebui')).toBeVisible();
    });

    test('shows how many settings are hidden', async ({ page }) => {
        await setModes(page, 'classic', true);
        const note = page.locator('#left-nav-panel .uxHiddenNote');
        await expect(note).toBeVisible();
        const [shown, expected] = await page.evaluate(() => {
            const text = document.querySelector('#left-nav-panel .uxHiddenNote').textContent;
            const panel = document.getElementById('left-nav-panel');
            document.body.classList.remove('ux-basic');
            const count = [...panel.querySelectorAll('.uxAdvanced')]
                .filter(el => el.getClientRects().length > 0 || el.closest('.inline-drawer-content'))
                .filter(el => !el.parentElement.closest('.uxAdvanced')).length;
            document.body.classList.add('ux-basic');
            return [parseInt(text, 10), count];
        });
        expect(shown).toBeGreaterThan(0);
        expect(shown).toBe(expected);
    });

    test('show restores everything', async ({ page }) => {
        await setModes(page, 'classic', true);
        await page.locator('#left-nav-panel .uxHiddenNote .uxHiddenNoteShow').click();
        expect(await page.evaluate(async () => (await import('./scripts/power-user.js')).power_user.ui_basic_settings)).toBe(false);
        await expect(page.locator('#mirostat_block_ooba')).toBeVisible();
        await expect(page.locator('.uxHiddenNote')).toHaveCount(0);
    });

    test('never changes setting values', async ({ page }) => {
        const snapshot = () => page.evaluate(async () => {
            const { textgenerationwebui_settings } = await import('./scripts/textgen-settings.js');
            const { oai_settings } = await import('./scripts/openai.js');
            return JSON.stringify([textgenerationwebui_settings, oai_settings]);
        });
        const before = await snapshot();
        await setModes(page, 'classic', true);
        await setModes(page, 'classic', false);
        expect(await snapshot()).toBe(before);
    });

    test('search reveals a basic-hidden setting', async ({ page }) => {
        await setModes(page, 'enhanced', true);
        await page.evaluate(async () => {
            const s = await import('./scripts/ux/ux-search.js');
            await s.revealSetting(document.getElementById('mirostat_block_ooba'));
        });
        await expect(page.locator('#mirostat_block_ooba')).toBeVisible();
        expect(await page.evaluate(() => document.body.classList.contains('ux-basic'))).toBe(false);
    });
});
