/**
 * Basic settings mode: hides rarely used generation settings behind a "Show" line.
 * It only toggles a CSS class; no setting value is ever read or written here.
 */
import { eventSource, event_types } from '../../script.js';
import { t } from '../i18n.js';

const ADVANCED_CLASS = 'uxAdvanced';

/** Text completion samplers counted as advanced (by their existing data-tg-samplers name). */
const ADVANCED_TG_SAMPLERS = [
    'top_k', 'typical_p', 'top_a', 'tfs', 'epsilon_cutoff', 'eta_cutoff', 'nsigma', 'skew', 'min_keep',
    'rep_pen_range', 'rep_pen_slope', 'rep_pen_decay', 'freq_pen', 'presence_pen', 'encoder_rep_pen', 'no_repeat_ngram_size',
    'penalty_alpha', 'num_beams', 'length_penalty', 'early_stopping', 'min_length', 'do_sample', 'n',
    'mirostat_mode', 'mirostat_tau', 'mirostat_eta',
    'dry_multiplier', 'dry_base', 'dry_allowed_length', 'dry_penalty_last_n', 'dry_sequence_breakers',
    'xtc_threshold', 'xtc_probability', 'adaptive_target', 'adaptive_decay',
    'dynatemp', 'min_temp', 'max_temp', 'dynatemp_exponent', 'smoothing_factor', 'smoothing_curve', 'temperature_last',
    'guidance_scale', 'negative_prompt', 'grammar_string', 'json_schema', 'logit_bias',
    'banned_tokens', 'global_banned_tokens', 'send_banned_tokens',
    'sampler_priority', 'samplers_priorities', 'samplers', 'sampler_order',
    'seed', 'max_tokens_second', 'speculative_ngram',
    'add_bos_token', 'ban_eos_token', 'skip_special_tokens', 'spaces_between_special_tokens', 'ignore_eos_token',
];

/** Containers matched directly. */
export const ADVANCED_SETTING_SELECTORS = [
    ...ADVANCED_TG_SAMPLERS.map(name => `#textgenerationwebui_api-settings [data-tg-samplers="${name}"]`),
    '#kobold_api-settings [name="miroStatBlock-kobold"]',
    '#kobold_api-settings #grammar_block',
    '#kobold_api-settings [name="KoboldSamplerOrderBlock"]',
];

/**
 * Controls counted as advanced, by ID. The nearest setting wrapper around each one is hidden.
 * Kobold (KAI), NovelAI and Chat Completion settings.
 */
export const ADVANCED_SETTING_IDS = [
    // KoboldAI
    'top_k', 'typical_p', 'top_a', 'tfs', 'rep_pen_range', 'rep_pen_slope', 'seed_kobold', 'use_default_badwordsids',
    // NovelAI
    'rep_pen_size_novel', 'rep_pen_slope_novel', 'rep_pen_freq_novel', 'rep_pen_presence_novel', 'tail_free_sampling_novel',
    'top_a_novel', 'top_k_novel', 'mirostat_tau_novel', 'mirostat_lr_novel', 'typical_p_novel', 'min_length_novel',
    'phrase_rep_pen_novel', 'logit_bias_novel',
    // Chat Completion
    'n_openai', 'freq_pen_openai', 'pres_pen_openai', 'top_k_openai', 'top_a_openai', 'seed_openai', 'logit_bias_openai',
];

const WRAPPER_SELECTOR = '.range-block, .flexBasis30p, label.checkbox_label';

/**
 * @returns {HTMLElement[]} Every element to hide in Basic mode, outermost only.
 */
function findAdvancedElements() {
    /** @type {Set<HTMLElement>} */
    const found = new Set();
    for (const selector of ADVANCED_SETTING_SELECTORS) {
        document.querySelectorAll(selector).forEach(el => found.add(/** @type {HTMLElement} */(el)));
    }
    for (const id of ADVANCED_SETTING_IDS) {
        const control = document.getElementById(id);
        if (!control) continue;
        const wrapper = /** @type {HTMLElement} */ (control.closest(WRAPPER_SELECTOR) ?? control);
        found.add(wrapper);
    }
    const all = [...found];
    return all.filter(el => !all.some(other => other !== el && other.contains(el)));
}

/**
 * Whether an element would be visible in its panel if Basic mode were off
 * (collapsed sections and a closed panel count as visible).
 * @param {HTMLElement} element
 * @param {HTMLElement} panel
 * @returns {boolean}
 */
function wouldBeVisible(element, panel) {
    if (element.style.display === 'none') return false;
    for (let node = element.parentElement; node && node !== panel; node = node.parentElement) {
        if (node.classList.contains('inline-drawer-content') || node.classList.contains(ADVANCED_CLASS)) continue;
        if (getComputedStyle(node).display === 'none') return false;
    }
    return true;
}

/**
 * Shows or updates the "N advanced settings hidden · Show" line in each affected panel.
 * @param {HTMLElement[]} elements
 * @param {boolean} enabled
 */
function updateNotes(elements, enabled) {
    document.querySelectorAll('.uxHiddenNote').forEach(n => n.remove());
    if (!enabled) return;

    /** @type {Map<HTMLElement, number>} */
    const counts = new Map();
    for (const el of elements) {
        const panel = /** @type {HTMLElement} */ (el.closest('.drawer-content'));
        if (!panel || !wouldBeVisible(el, panel)) continue;
        counts.set(panel, (counts.get(panel) ?? 0) + 1);
    }

    for (const [panel, count] of counts) {
        const note = document.createElement('div');
        note.classList.add('uxHiddenNote');
        const text = document.createElement('span');
        text.textContent = count === 1 ? t`${count} advanced setting hidden` : t`${count} advanced settings hidden`;
        const show = document.createElement('a');
        show.href = '#';
        show.classList.add('uxHiddenNoteShow');
        show.textContent = t`Show`;
        show.addEventListener('click', async (e) => {
            e.preventDefault();
            const { setBasicSettings } = await import('./ux-modes.js');
            setBasicSettings(false);
        });
        note.append(text, document.createTextNode(' · '), show);
        const anchor = panel.querySelector('#ux_basic_switch');
        if (anchor) {
            anchor.append(note);
        } else {
            (panel.querySelector('.scrollableInner') ?? panel).prepend(note);
        }
    }
}

/**
 * Marks advanced settings and refreshes the hidden-count notes. The CSS rule
 * `body.ux-basic .uxAdvanced` does the hiding, so marking is harmless when Basic mode is off.
 * @param {boolean} enabled
 */
export function applyBasicMode(enabled) {
    const elements = findAdvancedElements();
    elements.forEach(el => el.classList.add(ADVANCED_CLASS));
    updateNotes(elements, enabled);
}

/**
 * Re-applies Basic mode when the active API changes the visible settings.
 * @param {() => boolean} isEnabled
 */
export function initBasicMode(isEnabled) {
    const refresh = () => setTimeout(() => applyBasicMode(isEnabled()));
    $(document).on('change', '#main_api, #textgen_type, #chat_completion_source', refresh);
    eventSource.on(event_types.SETTINGS_LOADED_AFTER, refresh);
    eventSource.on(event_types.CHATCOMPLETION_SOURCE_CHANGED, refresh);
    applyBasicMode(isEnabled());
}
