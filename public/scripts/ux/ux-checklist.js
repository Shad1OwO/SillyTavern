/**
 * Welcome panel helpers: the interface style picker and a getting-started checklist.
 */
import { characters, eventSource, event_types, name1, online_status, saveSettingsDebounced } from '../../script.js';
import { power_user } from '../power-user.js';
import { t } from '../i18n.js';
import { isModernStyle, renderStyleSwitch, UX_EVENTS } from './ux-modes.js';

const DEFAULT_PERSONA_NAME = 'User';

/**
 * @typedef {object} ChecklistStep
 * @property {string} id
 * @property {() => string} label
 * @property {() => boolean} done
 * @property {string} target ID of the top bar drawer that completes the step
 * @property {string} icon
 */

/** @type {ChecklistStep[]} */
const STEPS = [
    {
        id: 'persona',
        label: () => t`Set your persona name`,
        done: () => !!name1 && name1 !== DEFAULT_PERSONA_NAME,
        target: 'persona-management-button',
        icon: 'fa-face-smile',
    },
    {
        id: 'api',
        label: () => t`Connect to an AI`,
        done: () => online_status !== 'no_connection',
        target: 'sys-settings-button',
        icon: 'fa-plug',
    },
    {
        id: 'character',
        label: () => t`Pick a character`,
        done: () => Array.isArray(characters) && characters.length > 0,
        target: 'rightNavHolder',
        icon: 'fa-address-card',
    },
];

/**
 * Renders the style picker and (outside Classic) the checklist into a welcome panel mount point.
 * Once dismissed, neither is shown on the welcome panel; the style picker stays in User Settings.
 * @param {HTMLElement} root
 */
export function renderGettingStarted(root) {
    if (!root) return;
    root.innerHTML = '';
    root.classList.add('uxGettingStarted');
    root.dataset.uxMounted = 'true';
    if (power_user.ui_checklist_dismissed) return;

    const header = document.createElement('div');
    header.classList.add('uxGettingStartedHeader');
    const title = document.createElement('b');
    title.textContent = t`Choose your interface`;
    const dismiss = document.createElement('a');
    dismiss.href = '#';
    dismiss.classList.add('uxChecklistDismiss');
    dismiss.textContent = t`Dismiss`;
    dismiss.title = t`Hide this from the welcome screen. You can still change the interface in User Settings.`;
    dismiss.addEventListener('click', (e) => {
        e.preventDefault();
        power_user.ui_checklist_dismissed = true;
        saveSettingsDebounced();
        refreshGettingStarted();
    });
    header.append(title, dismiss);

    const picker = document.createElement('div');
    renderStyleSwitch(picker);
    root.append(header, picker);

    if (!isModernStyle()) return;

    const list = document.createElement('ol');
    list.classList.add('uxChecklist');
    const listTitle = document.createElement('b');
    listTitle.classList.add('uxChecklistTitle');
    listTitle.textContent = t`Getting started`;
    for (const step of STEPS) {
        const done = step.done();
        const item = document.createElement('li');
        item.dataset.step = step.id;
        item.classList.toggle('done', done);
        const check = document.createElement('i');
        check.className = `fa-solid fa-fw ${done ? 'fa-circle-check' : 'fa-circle'}`;
        const button = document.createElement('button');
        button.classList.add('menu_button', 'menu_button_icon', 'drawer-opener', 'inline-flex');
        button.dataset.target = step.target;
        const icon = document.createElement('i');
        icon.className = `fa-solid fa-fw ${step.icon}`;
        const label = document.createElement('span');
        label.textContent = step.label();
        button.append(icon, label);
        item.append(check, button);
        list.append(item);
    }
    root.append(listTitle, list);
}

/**
 * Re-renders every mounted getting-started block.
 */
export function refreshGettingStarted() {
    document.querySelectorAll('.uxGettingStarted').forEach(el => renderGettingStarted(/** @type {HTMLElement} */(el)));
}

/**
 * Keeps the getting-started blocks in sync with app state.
 */
export function initGettingStarted() {
    const refresh = () => refreshGettingStarted();
    eventSource.on(event_types.ONLINE_STATUS_CHANGED, refresh);
    eventSource.on(event_types.CHAT_CHANGED, refresh);
    eventSource.on(event_types.CHARACTER_PAGE_LOADED, refresh);
    eventSource.on(UX_EVENTS.STYLE_CHANGED, refresh);
    eventSource.on(event_types.PERSONA_CHANGED, refresh);
}
