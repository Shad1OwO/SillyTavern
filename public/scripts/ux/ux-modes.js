/**
 * Selectable interface styles (Classic / Enhanced / Sidebar) and the Basic / Advanced settings switch.
 * Both work by toggling body classes; Classic adds none, so the default UI is untouched.
 */
import { eventSource, event_types, saveSettingsDebounced } from '../../script.js';
import { power_user } from '../power-user.js';
import { t } from '../i18n.js';
import { SlashCommandParser } from '../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from '../slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue } from '../slash-commands/SlashCommandEnumValue.js';
import { openSettingsSearch } from './ux-search.js';
import { initGettingStarted } from './ux-checklist.js';
import { applyBasicMode, initBasicMode } from './ux-basic.js';

export const UI_STYLES = Object.freeze({
    CLASSIC: 'classic',
    ENHANCED: 'enhanced',
    SIDEBAR: 'sidebar',
});

export const UX_EVENTS = Object.freeze({
    STYLE_CHANGED: 'ux_style_changed',
    BASIC_CHANGED: 'ux_basic_changed',
});

const STYLE_CLASSES = {
    [UI_STYLES.CLASSIC]: null,
    [UI_STYLES.ENHANCED]: 'ux-enhanced',
    [UI_STYLES.SIDEBAR]: 'ux-sidebar',
};

const STYLE_INFO = {
    [UI_STYLES.CLASSIC]: { icon: 'fa-table-cells', label: () => t`Classic`, description: () => t`The original SillyTavern layout.` },
    [UI_STYLES.ENHANCED]: { icon: 'fa-wand-magic-sparkles', label: () => t`Enhanced`, description: () => t`Labeled menu, search everywhere, getting-started guide.` },
    [UI_STYLES.SIDEBAR]: { icon: 'fa-table-columns', label: () => t`Sidebar`, description: () => t`Enhanced, with the menu down the left side on wide screens.` },
};

/** Short names for the built-in top bar drawers, keyed by drawer ID. */
const DRAWER_LABELS = {
    'ai-config-button': () => t`AI Settings`,
    'sys-settings-button': () => t`API`,
    'advanced-formatting-button': () => t`Formatting`,
    'WI-SP-button': () => t`World Info`,
    'user-settings-button': () => t`Settings`,
    'backgrounds-button': () => t`Backgrounds`,
    'extensions-settings-button': () => t`Extensions`,
    'persona-management-button': () => t`Persona`,
    'rightNavHolder': () => t`Characters`,
    'ux_search_button': () => t`Search`,
};

const DEFAULT_TOAST_POSITION = 'toast-top-center';
const MODERN_TOAST_POSITION = 'toast-bottom-right';

/**
 * Gets the display name of a top bar drawer.
 * @param {Element} drawer A `.drawer` element in the top bar
 * @returns {string}
 */
export function getDrawerLabel(drawer) {
    const known = DRAWER_LABELS[drawer?.id];
    if (known) return known();
    const icon = drawer?.querySelector('.drawer-icon');
    return (icon?.getAttribute('title') || drawer?.getAttribute('title') || '').trim();
}

/**
 * Adds a text label under every top bar drawer icon that lacks one.
 * Labels are hidden by CSS in the Classic style.
 */
export function labelTopBarDrawers() {
    document.querySelectorAll('#top-settings-holder > .drawer').forEach((drawer) => {
        const toggle = drawer.querySelector(':scope > .drawer-toggle');
        if (!toggle) return;
        const text = getDrawerLabel(drawer);
        let label = toggle.querySelector(':scope > .uxDrawerLabel');
        if (!label) {
            label = document.createElement('span');
            label.classList.add('uxDrawerLabel');
            label.setAttribute('aria-hidden', 'true');
            toggle.append(label);
        }
        if (label.textContent !== text) label.textContent = text;
        if (text && !label.title) label.title = text;
    });
}

/**
 * Adds the search button to the start of the top bar. It is hidden by CSS in the Classic style.
 */
function addSearchButton() {
    const topBar = document.getElementById('top-settings-holder');
    if (!topBar || document.getElementById('ux_search_button')) return;
    const drawer = document.createElement('div');
    drawer.id = 'ux_search_button';
    drawer.classList.add('drawer');
    const toggle = document.createElement('div');
    toggle.classList.add('drawer-toggle');
    toggle.setAttribute('role', 'button');
    toggle.tabIndex = 0;
    const icon = document.createElement('div');
    icon.classList.add('drawer-icon', 'fa-solid', 'fa-magnifying-glass', 'fa-fw', 'closedIcon');
    icon.title = t`Search all settings (Ctrl+K)`;
    toggle.append(icon);
    toggle.addEventListener('click', () => openSettingsSearch());
    toggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSettingsSearch();
        }
    });
    drawer.append(toggle);
    topBar.prepend(drawer);
}

/**
 * Ctrl+K / Cmd+K opens settings search outside text fields, in non-classic styles.
 * @param {KeyboardEvent} e
 */
function onSearchHotkey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.code !== 'KeyK') return;
    if (!isModernStyle()) return;
    const target = /** @type {HTMLElement} */ (e.target);
    if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    openSettingsSearch();
}

/**
 * Moves toasts out of the top bar area in non-classic styles, unless the user picked a position.
 * Never changes the saved setting.
 */
function applyToastPosition() {
    if (typeof toastr === 'undefined') return;
    const saved = power_user.toastr_position || DEFAULT_TOAST_POSITION;
    const wanted = (isModernStyle() && saved === DEFAULT_TOAST_POSITION) ? MODERN_TOAST_POSITION : saved;
    toastr.options.positionClass = wanted;
}

/**
 * @param {string} style
 * @returns {boolean}
 */
function isValidStyle(style) {
    return Object.values(UI_STYLES).includes(style);
}

/**
 * @returns {string} The active interface style.
 */
export function getUiStyle() {
    return isValidStyle(power_user.ui_style) ? power_user.ui_style : UI_STYLES.CLASSIC;
}

/**
 * @returns {boolean} Whether any non-classic style is active.
 */
export function isModernStyle() {
    return getUiStyle() !== UI_STYLES.CLASSIC;
}

/**
 * Applies the current state to the body and every switch without saving.
 */
function applyState() {
    const style = getUiStyle();
    for (const [key, cls] of Object.entries(STYLE_CLASSES)) {
        if (cls) document.body.classList.toggle(cls, key === style);
    }
    document.body.classList.toggle('ux-basic', !!power_user.ui_basic_settings);
    applyToastPosition();

    document.querySelectorAll('.uxStyleSwitch [data-ux-style]').forEach((button) => {
        const active = button.getAttribute('data-ux-style') === style;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('.uxBasicSwitch').forEach((button) => {
        const basic = !!power_user.ui_basic_settings;
        button.classList.toggle('active', basic);
        button.setAttribute('aria-pressed', String(basic));
        const label = button.querySelector('.uxBasicSwitchLabel');
        if (label) label.textContent = basic ? t`Basic settings` : t`All settings`;
        const icon = button.querySelector('i');
        if (icon) icon.className = `fa-solid fa-fw ${basic ? 'fa-eye-slash' : 'fa-eye'}`;
        button.title = basic ? t`Advanced settings are hidden. Click to show all settings.` : t`All settings are shown. Click to hide advanced settings.`;
    });
}

/**
 * Sets the interface style. Invalid values fall back to Classic.
 * @param {string} style One of UI_STYLES
 */
export function setUiStyle(style) {
    const next = isValidStyle(style) ? style : UI_STYLES.CLASSIC;
    power_user.ui_style = next;
    applyState();
    saveSettingsDebounced();
    eventSource.emit(UX_EVENTS.STYLE_CHANGED, next);
}

/**
 * Turns Basic settings mode on or off.
 * @param {boolean} enabled
 */
export function setBasicSettings(enabled) {
    power_user.ui_basic_settings = !!enabled;
    applyState();
    applyBasicMode(!!enabled);
    saveSettingsDebounced();
    eventSource.emit(UX_EVENTS.BASIC_CHANGED, !!enabled);
}

/**
 * Renders the three-way interface style switch into a container.
 * @param {HTMLElement} container
 */
export function renderStyleSwitch(container) {
    if (!container) return;
    container.classList.add('uxStyleSwitch');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', t`Interface style`);
    container.innerHTML = '';
    for (const style of Object.values(UI_STYLES)) {
        const info = STYLE_INFO[style];
        const button = document.createElement('div');
        button.classList.add('menu_button', 'uxStyleOption');
        button.setAttribute('data-ux-style', style);
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
        const icon = document.createElement('i');
        icon.className = `fa-solid fa-fw ${info.icon}`;
        const label = document.createElement('b');
        label.textContent = info.label();
        const description = document.createElement('small');
        description.textContent = info.description();
        button.append(icon, label, description);
        button.addEventListener('click', () => setUiStyle(style));
        button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setUiStyle(style);
            }
        });
        container.append(button);
    }
    applyState();
}

/**
 * Renders the Basic / All settings toggle button into a container.
 * @param {HTMLElement} container
 */
export function renderBasicSwitch(container) {
    if (!container) return;
    container.innerHTML = '';
    const button = document.createElement('div');
    button.classList.add('menu_button', 'menu_button_icon', 'uxBasicSwitch');
    button.setAttribute('role', 'button');
    button.tabIndex = 0;
    const icon = document.createElement('i');
    const label = document.createElement('span');
    label.classList.add('uxBasicSwitchLabel');
    button.append(icon, label);
    const toggle = () => setBasicSettings(!power_user.ui_basic_settings);
    button.addEventListener('click', toggle);
    button.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
        }
    });
    container.append(button);
    applyState();
}

function registerSlashCommands() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'ui-style',
        callback: (_args, value) => {
            const style = String(value ?? '').trim().toLowerCase();
            if (style) {
                if (!isValidStyle(style)) {
                    toastr.warning(t`Unknown interface style: ${style}`);
                    return getUiStyle();
                }
                setUiStyle(style);
            }
            return getUiStyle();
        },
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'interface style',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                enumList: Object.values(UI_STYLES).map(style => new SlashCommandEnumValue(style, STYLE_INFO[style].description())),
            }),
        ],
        returns: 'the current interface style',
        helpString: 'Switches the interface style (classic, enhanced or sidebar). Returns the current style if no value is provided.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'ui-basic',
        callback: (_args, value) => {
            const arg = String(value ?? '').trim().toLowerCase();
            if (arg === 'on' || arg === 'true') setBasicSettings(true);
            else if (arg === 'off' || arg === 'false') setBasicSettings(false);
            else if (arg === 'toggle') setBasicSettings(!power_user.ui_basic_settings);
            return power_user.ui_basic_settings ? 'on' : 'off';
        },
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'state',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                enumList: ['on', 'off', 'toggle'],
            }),
        ],
        returns: 'on or off',
        helpString: 'Shows only basic settings (on), all settings (off), or toggles. Returns the current state if no value is provided.',
    }));
}

/**
 * Initializes interface styles. Called once after settings are loaded.
 */
export async function initUxModes() {
    renderStyleSwitch(document.getElementById('ux_style_switch'));
    renderBasicSwitch(document.getElementById('ux_basic_switch'));
    renderBasicSwitch(document.getElementById('ux_basic_switch_user'));
    addSearchButton();
    document.addEventListener('keydown', onSearchHotkey);
    labelTopBarDrawers();
    const topBar = document.getElementById('top-settings-holder');
    if (topBar) {
        new MutationObserver(() => labelTopBarDrawers()).observe(topBar, { childList: true });
    }
    applyState();
    eventSource.on(event_types.SETTINGS_LOADED_AFTER, () => applyState());
    // The toast position dropdown sets toastr directly; re-apply our override afterwards.
    $('#toastr_position').on('change', () => setTimeout(applyToastPosition));
    registerSlashCommands();
    initGettingStarted();
    initBasicMode(() => !!power_user.ui_basic_settings);
}
