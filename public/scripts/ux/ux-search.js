/**
 * Search across every top bar panel: find a setting by its label and jump to it.
 */
import { animation_duration } from '../../script.js';
import { t } from '../i18n.js';
import { Popup, POPUP_RESULT, POPUP_TYPE } from '../popup.js';
import { delay } from '../utils.js';
import { getDrawerLabel, setBasicSettings } from './ux-modes.js';

/**
 * @typedef {object} SettingsIndexEntry
 * @property {string} label Visible text of the setting or section
 * @property {string} panel Name of the top bar panel that holds it
 * @property {HTMLElement} element The element to reveal
 */

const MAX_RESULTS = 30;
const MAX_LABEL_LENGTH = 80;
const FLASH_MS = 2000;
const CANDIDATE_SELECTOR = [
    'label',
    'h3',
    'h4',
    'h5',
    '.inline-drawer-header b',
    '.standoutHeader',
    'small[data-i18n]',
    'span[data-i18n]',
    'div[data-i18n]:not(:has(*))',
].join(',');

/**
 * Checks whether something other than a collapsed section, a closed panel, or Basic mode hides this element
 * (for example, a block that belongs to a different API).
 * @param {HTMLElement} element
 * @param {HTMLElement} root The panel's drawer-content
 * @param {Map<Element, boolean>} cache
 * @returns {boolean}
 */
function isHiddenForOtherReasons(element, root, cache) {
    /** @type {HTMLElement[]} */
    const visited = [];
    let node = element;
    let hidden = false;
    while (node && node !== root) {
        if (cache.has(node)) {
            hidden = cache.get(node);
            break;
        }
        visited.push(node);
        const expected = node.classList.contains('inline-drawer-content') || node.classList.contains('uxAdvanced');
        if (!expected && getComputedStyle(node).display === 'none') {
            hidden = true;
            break;
        }
        node = node.parentElement;
    }
    visited.forEach(n => cache.set(n, hidden));
    return hidden;
}

/**
 * Builds a list of searchable settings from every top bar panel.
 * @returns {SettingsIndexEntry[]}
 */
export function buildSettingsIndex() {
    /** @type {SettingsIndexEntry[]} */
    const index = [];
    const seen = new Set();
    const cache = new Map();
    document.querySelectorAll('#top-settings-holder > .drawer').forEach((drawer) => {
        const content = /** @type {HTMLElement} */ (drawer.querySelector(':scope > .drawer-content, :scope > nav.drawer-content'));
        if (!content) return;
        const panel = getDrawerLabel(drawer);
        content.querySelectorAll(CANDIDATE_SELECTOR).forEach((node) => {
            const element = /** @type {HTMLElement} */ (node);
            const label = (element.textContent || '').replace(/\s+/g, ' ').trim();
            if (!label || label.length > MAX_LABEL_LENGTH || !/[a-z]/i.test(label)) return;
            const key = `${panel}\u0000${label.toLowerCase()}`;
            if (seen.has(key)) return;
            if (isHiddenForOtherReasons(element, content, cache)) return;
            seen.add(key);
            index.push({ label, panel, element });
        });
    });
    return index;
}

/**
 * Finds settings matching a query. Labels that start with the query come first,
 * then labels with a word starting with it, then any other match; shorter labels win ties.
 * @param {SettingsIndexEntry[]} index
 * @param {string} query
 * @returns {SettingsIndexEntry[]}
 */
export function searchSettings(index, query) {
    const q = String(query ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!q) return [];
    const words = q.split(' ');
    const rank = (/** @type {string} */ label) => {
        const l = label.toLowerCase();
        if (l.startsWith(q)) return 0;
        if (l.includes(` ${q}`) || l.includes(`(${q}`) || l.includes(`-${q}`)) return 1;
        if (l.includes(q)) return 2;
        return 3;
    };
    return index
        .filter(entry => words.every(w => entry.label.toLowerCase().includes(w)))
        .map(entry => ({ entry, score: rank(entry.label) }))
        .sort((a, b) => a.score - b.score || a.entry.label.length - b.entry.label.length)
        .slice(0, MAX_RESULTS)
        .map(x => x.entry);
}

/**
 * Opens the panel holding an element, expands collapsed sections around it, scrolls to it and highlights it.
 * @param {HTMLElement} element
 */
export async function revealSetting(element) {
    if (!element) return;
    const wait = () => delay((animation_duration || 0) + 50);

    if (document.body.classList.contains('ux-basic') && element.closest('.uxAdvanced')) {
        setBasicSettings(false);
    }

    const drawer = element.closest('#top-settings-holder > .drawer');
    const content = drawer?.querySelector(':scope > .drawer-content');
    if (drawer && content && !content.classList.contains('openDrawer')) {
        $(drawer).find('> .drawer-toggle').first().trigger('click');
        await wait();
    }

    /** @type {HTMLElement[]} */
    const collapsed = [];
    for (let node = element.parentElement; node && node !== content; node = node.parentElement) {
        if (node.classList.contains('inline-drawer-content') && getComputedStyle(node).display === 'none') {
            collapsed.unshift(node);
        }
    }
    for (const section of collapsed) {
        const toggle = section.parentElement?.querySelector(':scope > .inline-drawer-toggle, :scope > .inline-drawer-header');
        if (toggle) {
            $(toggle).trigger('click');
        } else {
            section.style.display = 'block';
        }
    }
    if (collapsed.length) await wait();

    element.scrollIntoView({ block: 'center', behavior: 'instant' });
    element.classList.add('uxFlash');
    setTimeout(() => element.classList.remove('uxFlash'), FLASH_MS);
}

/**
 * Opens the search popup.
 */
export async function openSettingsSearch() {
    if (document.querySelector('.uxSearchInput')) return;
    const index = buildSettingsIndex();

    const root = document.createElement('div');
    root.classList.add('uxSearch');
    const input = document.createElement('input');
    input.type = 'search';
    input.classList.add('text_pole', 'uxSearchInput');
    input.placeholder = t`Search all settings…`;
    input.setAttribute('aria-label', t`Search all settings`);
    const list = document.createElement('div');
    list.classList.add('uxSearchResults');
    list.setAttribute('role', 'listbox');
    root.append(input, list);

    /** @type {SettingsIndexEntry[]} */
    let results = [];
    let selected = 0;
    /** @type {SettingsIndexEntry|null} */
    let chosen = null;

    const popup = new Popup(root, POPUP_TYPE.TEXT, '', { okButton: t`Close`, allowVerticalScrolling: true });

    const choose = (/** @type {number} */ i) => {
        if (!results[i]) return;
        chosen = results[i];
        popup.complete(POPUP_RESULT.AFFIRMATIVE);
    };

    const render = () => {
        list.innerHTML = '';
        if (input.value.trim() && !results.length) {
            const empty = document.createElement('div');
            empty.classList.add('uxSearchEmpty');
            empty.textContent = t`No settings found.`;
            list.append(empty);
            return;
        }
        results.forEach((entry, i) => {
            const row = document.createElement('div');
            row.classList.add('uxSearchResult');
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', String(i === selected));
            row.classList.toggle('selected', i === selected);
            const label = document.createElement('span');
            label.textContent = entry.label;
            const panel = document.createElement('small');
            panel.textContent = entry.panel;
            row.append(label, panel);
            row.addEventListener('click', () => choose(i));
            list.append(row);
        });
        list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    };

    input.addEventListener('input', () => {
        results = searchSettings(index, input.value);
        selected = 0;
        render();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selected = Math.min(selected + 1, Math.max(results.length - 1, 0));
            render();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selected = Math.max(selected - 1, 0);
            render();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            choose(selected);
        }
    });

    const shown = popup.show();
    input.focus();
    await shown;
    if (chosen) {
        await revealSetting(chosen.element);
    }
}
