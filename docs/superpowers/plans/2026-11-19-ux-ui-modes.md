# Selectable Interface Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Classic / Enhanced / Sidebar interface-style switch and an independent Basic / Advanced settings switch to SillyTavern, without changing any existing setting, ID or Classic behaviour.

**Architecture:** Both new styles are body classes (`ux-enhanced`, `ux-sidebar`, `ux-basic`) plus scoped CSS and a little JS layered over the existing DOM. New state lives in `power_user` and saves through `saveSettingsDebounced`. Each concern is in its own small module under `public/scripts/ux/`.

**Tech Stack:** Vanilla JS ES modules + jQuery (existing), CSS, Playwright e2e tests (`tests/frontend/*.e2e.js`).

**Spec:** `docs/superpowers/specs/2026-11-19-ux-ui-modes-design.md`

## Global Constraints

- Classic (`power_user.ui_style === 'classic'`, the default) must be pixel-identical to today: every new CSS rule is scoped under `body.ux-enhanced`, `body.ux-sidebar` or `body.ux-basic`.
- No existing element ID, class, or setting key is renamed or removed; no existing element is moved in the DOM.
- New settings: `power_user.ui_style` (`'classic' | 'enhanced' | 'sidebar'`, default `'classic'`), `power_user.ui_basic_settings` (boolean, default `false`), `power_user.ui_checklist_dismissed` (boolean, default `false`). They are not part of themes.
- Switching style or Basic mode applies instantly, with no reload.
- Basic mode only hides elements; it never writes a setting value.
- All new user-facing strings use `data-i18n` / `t\`\`` with English text as the key.
- Sidebar rail activates at viewport width ≥ 1000px; below that Sidebar renders as Enhanced.
- `npm run lint` passes.

## Review Focus

1. Extension-added top-bar drawers (any `.drawer` an extension appends to `#top-settings-holder`) get a label in Enhanced/Sidebar and still open/close. → test in Task 2.
2. Pinned side panels (`#lm_button_panel_pin`, `#rm_button_panel_pin` checked) don't overlap the Sidebar rail. → test in Task 4.
3. Search result inside a collapsed `.inline-drawer` inside a closed drawer is revealed (drawer opened, inline drawer expanded, element scrolled into view). → test in Task 3.
4. Turning Basic on while a hidden setting's section is the one the user is looking at leaves a visible "N advanced settings hidden · Show" line. → test in Task 5.
5. A user who already changed toast position keeps it in Enhanced; only the default `toast-top-center` is moved. → test in Task 2.

## File Structure

| File | Responsibility |
|---|---|
| `public/scripts/ux/ux-modes.js` (create) | State, body classes, segmented controls, slash commands, toast default, init |
| `public/scripts/ux/ux-search.js` (create) | Global settings search index, popup, reveal-and-highlight |
| `public/scripts/ux/ux-checklist.js` (create) | Getting-started checklist + style picker on the welcome panel |
| `public/scripts/ux/ux-basic.js` (create) | Advanced-setting selector list, hide/show, hidden-count notes |
| `public/css/ux-modes.css` (create) | All Enhanced / Sidebar / Basic CSS |
| `public/style.css` (modify, line ~13) | `@import url(css/ux-modes.css);` |
| `public/scripts/power-user.js` (modify, defaults object ~line 140) | Three new defaults |
| `public/index.html` (modify, `#UI-presets-block` ~line 4925; `#left-nav-panel` top ~line 80) | Containers for the controls |
| `public/scripts/templates/welcomePanel.html` (modify) | `<div class="uxGettingStarted"></div>` mount point |
| `public/script.js` (modify, init sequence ~line 778) | `initUxModes()` call |
| `tests/frontend/UxModes.e2e.js` (create) | All e2e tests below |

Tests run against the dev server: `cd tests && ST_BASE_URL=http://127.0.0.1:8123 npx playwright test frontend/UxModes.e2e.js`. Tests reach modules through `page.evaluate(async () => { const m = await import('./scripts/ux/ux-modes.js'); ... })`, as `MacroStoryString.e2e.js` does.

---

### Task 1: State, switches and slash commands

**Files:** Create `public/scripts/ux/ux-modes.js`; modify `power-user.js` defaults, `index.html` (`#UI-presets-block`, `#left-nav-panel`), `script.js` init, `style.css`; create `public/css/ux-modes.css` (empty skeleton) and `tests/frontend/UxModes.e2e.js`.

**Interfaces — Produces:**
- `export const UI_STYLES = Object.freeze({ CLASSIC: 'classic', ENHANCED: 'enhanced', SIDEBAR: 'sidebar' })`
- `export function setUiStyle(style: string): void`: validates (falls back to classic), sets `power_user.ui_style`, toggles `ux-enhanced`/`ux-sidebar` on `body`, syncs every `.uxStyleSwitch`, calls `saveSettingsDebounced()`, emits `eventSource.emit('ux_style_changed', style)`.
- `export function setBasicSettings(enabled: boolean): void`: same pattern for `ux-basic` / `.uxBasicSwitch`; emits `'ux_basic_changed'`.
- `export function renderStyleSwitch(container: HTMLElement): void`: three `menu_button` buttons with `data-ux-style`, an icon, a label and a one-line description; the active one has class `active`.
- `export function renderBasicSwitch(container: HTMLElement): void`: one toggle button (`Basic settings` / `All settings`).
- `export async function initUxModes(): Promise<void>`: on `event_types.SETTINGS_LOADED_AFTER` applies both states; renders switches into `#ux_style_switch` (User Settings) and `#ux_basic_switch` (top of `#left-nav-panel`, below the pin) and `#ux_basic_switch_user` (User Settings); registers `/ui-style` (enum classic|enhanced|sidebar; no argument returns the current value) and `/ui-basic` (on|off|toggle; no argument returns the current value).

- [ ] **Step 1: Write failing tests** in `UxModes.e2e.js` (`test.beforeEach(testSetup.awaitST)`, each test resets to classic/off in `afterEach`):
  - `defaults to classic`: `power_user.ui_style === 'classic'`, `ui_basic_settings === false`; body has none of `ux-enhanced|ux-sidebar|ux-basic`.
  - `style switch applies instantly`: click `#ux_style_switch [data-ux-style="enhanced"]` → body has `ux-enhanced`, `power_user.ui_style === 'enhanced'`; click sidebar → `ux-sidebar` and not `ux-enhanced`.
  - `slash commands`: run `/ui-style sidebar` via `executeSlashCommandsWithOptions` → body `ux-sidebar`; `/ui-basic toggle` → `ux-basic`; `/ui-style bogus` → stays `sidebar`.
  - `classic unchanged`: in classic, `getComputedStyle(#top-settings-holder).height` equals the value recorded with the stylesheet `css/ux-modes.css` disabled.
- [ ] **Step 2: Run, expect FAIL** (module not found).
- [ ] **Step 3: Implement** per the interfaces above. `initUxModes()` is called in `script.js` right after `initWelcomeScreen()`.
- [ ] **Step 4: Run, expect PASS**; `npm run lint` clean.
- [ ] **Step 5: Commit** `feat(ui): add interface style and basic settings switches`.

### Task 2: Enhanced style — labels, toasts, spacing

**Files:** Modify `ux-modes.js`, `ux-modes.css`, test file.

**Interfaces — Consumes:** `setUiStyle`, `'ux_style_changed'`. **Produces:** `export function labelTopBarDrawers(): void`, which adds a `<span class="uxDrawerLabel">` inside each `#top-settings-holder > .drawer > .drawer-toggle` that lacks one. The text is a short name from this map, falling back to the icon's `title`:

`ai-config-button: AI Settings · sys-settings-button: API · advanced-formatting-button: Formatting · WI-SP-button: World Info · user-settings-button: Settings · backgrounds-button: Backgrounds · extensions-settings-button: Extensions · persona-management-button: Persona · rightNavHolder: Characters`

A `MutationObserver` on `#top-settings-holder` (childList) relabels when extensions add drawers. Labels are hidden by CSS outside Enhanced/Sidebar, so Classic is unaffected.

- CSS: under `body.ux-enhanced, body.ux-sidebar` redefine `--topBarBlockSize` to fit icon + label (all existing layout follows that variable); active drawer (`.drawer-icon.openIcon`) label gets the accent colour; below 700px the labels shrink to 10px, and below 480px they hide and `.drawer-content.openDrawer::before` shows `attr(data-ux-title)` as a header. JS sets `data-ux-title` on each drawer-content from the same map. Slightly larger `.menu_button` padding and drawer row gap.
- Toasts: when the style becomes non-classic and `power_user.toastr_position === 'toast-top-center'`, set `toastr.options.positionClass = 'toast-bottom-right'` at runtime without writing `power_user.toastr_position`; restore it when going back to classic.

- [ ] **Step 1: Failing tests:**
  - `labels every drawer`: enhanced → `.uxDrawerLabel` count equals `#top-settings-holder > .drawer` count, and `#sys-settings-button .uxDrawerLabel` text is `API`; visible.
  - `labels extension drawers`: append a `<div class="drawer" id="test-ext"><div class="drawer-toggle"><div class="drawer-icon" title="My Ext"></div></div></div>` → label `My Ext` appears.
  - `classic hides labels`: classic → every `.uxDrawerLabel` has `display: none`.
  - `toast default moved`: enhanced with default position → `toastr.options.positionClass === 'toast-bottom-right'` and `power_user.toastr_position === 'toast-top-center'`.
  - `toast custom kept`: set `power_user.toastr_position = 'toast-top-left'`, apply it, then switch to enhanced → `toastr.options.positionClass === 'toast-top-left'`.
  - `drawer still opens`: enhanced → click `#sys-settings-button .drawer-toggle` → `#rm_api_block` is visible and the drawer-content has `openDrawer`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**; lint.
- [ ] **Step 5: Commit** `feat(ui): enhanced style with labeled top bar`.

### Task 3: Search everywhere

**Files:** Create `public/scripts/ux/ux-search.js`; modify `ux-modes.js` (adds the search button and hotkey), `ux-modes.css`, test file.

**Interfaces — Produces:**
- `export function buildSettingsIndex(): Array<{ label: string, panel: string, element: HTMLElement }>`: scans every `#top-settings-holder .drawer-content` for `label`, `h3`, `h4`, `.inline-drawer-header b`, `[data-i18n]` text and the `title` attributes of `.menu_button` elements. It skips elements inside containers hidden by API selection (`[data-tg-type]`, `[data-source]` or `[data-ux-api-hidden]` that are currently `display:none` for a reason other than `ux-basic`). `panel` is the drawer's label from Task 2's map. Built on each popup open (cheap: DOM is static).
- `export function searchSettings(index, query: string): typeof index`: case-insensitive; matches label substrings; ranks prefix matches first; returns ≤ 30; dedupes identical label+panel.
- `export async function revealSetting(element: HTMLElement): Promise<void>`: if inside a closed top-bar drawer, triggers its `.drawer-toggle` click; expands every ancestor `.inline-drawer` whose content is hidden (triggers `.inline-drawer-toggle` click); if the element is hidden by `ux-basic`, calls `setBasicSettings(false)`; scrolls into view (`block: 'center'`); adds class `uxFlash` for 2s.
- `export function openSettingsSearch(): Promise<void>`: `Popup` (`POPUP_TYPE.TEXT`) with an input and a result list; arrow keys + Enter choose; clicking or Enter closes the popup and calls `revealSetting`.
- In Enhanced/Sidebar a search drawer-style button `#ux_search_button` (fa-magnifying-glass, label "Search") is added to `#top-settings-holder` at the start; `Ctrl+K` / `Cmd+K` opens search in every style except Classic.

- [ ] **Step 1: Failing tests:**
  - `finds settings in other panels`: `searchSettings(buildSettingsIndex(), 'temperature')` returns ≥ 1 entry whose `panel === 'AI Settings'`.
  - `prefix ranks first`: results for `'tem'` start with a label beginning with "Tem".
  - `reveals nested setting` (Review Focus 3): close all drawers; collapse the `.inline-drawer` containing `#auto_fix_generated_markdown` (User Settings); `revealSetting(thatElement)` → `#user-settings-block` visible, element visible in viewport, has `uxFlash`.
  - `hotkey opens popup`: enhanced, press `Control+k` → `.popup input.uxSearchInput` focused; classic, press → no popup.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**; lint.
- [ ] **Step 5: Commit** `feat(ui): search settings across all panels`.

### Task 4: Getting-started checklist and Sidebar style

**Files:** Create `public/scripts/ux/ux-checklist.js`; modify `welcomePanel.html`, `welcome-screen.js` (`sendWelcomePanel` calls `renderGettingStarted` on each `.uxGettingStarted`), `ux-modes.css`, test file.

**Interfaces — Produces:** `export function renderGettingStarted(root: HTMLElement): void`. Always renders the style picker (`renderStyleSwitch`), headed "Choose your interface", so new Classic users can find it. When style ≠ classic and `!power_user.ui_checklist_dismissed`, it also renders three steps with live check marks:
1. "Set your persona name": done when `name1` is non-empty and not `'User'`; button opens `#persona-management-button`.
2. "Connect to an AI": done when `online_status !== 'no_connection'`; button opens `#sys-settings-button`.
3. "Pick a character": done when `characters.length > 0`; button opens `#rightNavHolder`.
Re-renders on `ONLINE_STATUS_CHANGED`, `CHAT_CHANGED`, `ux_style_changed`. A "Dismiss" link sets `ui_checklist_dismissed = true` and saves.

**Sidebar CSS** (`body.ux-sidebar`, `@media (min-width: 1000px)`):
- `#top-settings-holder` becomes a fixed left column of width `--uxRailWidth: 84px`, full height, items stacked (icon over label).
- `--topBarBlockSize` stays as Enhanced for mobile; on desktop the top offset becomes 0 and `#sheld`, `.drawer-content` (non-fill) and `#left-nav-panel` get `left: var(--uxRailWidth)`; non-fill drawer-contents open as a panel `left: var(--uxRailWidth); top: 0; height: 100dvh; width: min(700px, 50vw)`.
- `#right-nav-panel` keeps its right edge; when pinned, `#sheld` width reduces as today.

- [ ] **Step 1: Failing tests:**
  - `picker on welcome in classic`: classic → `.welcomePanel .uxStyleSwitch` is visible; `.uxChecklist` absent.
  - `checklist states`: enhanced, no API connected → step 2 has no `done` class; set `online_status`-dependent state by emitting `ONLINE_STATUS_CHANGED` with a stubbed status → `done`.
  - `dismiss persists`: click Dismiss → `power_user.ui_checklist_dismissed === true`, checklist removed.
  - `sidebar rail desktop`: viewport 1366×800, sidebar → `#top-settings-holder` bounding box `x === 0`, `width ≈ 84`, `height ≈ 800`; `#sheld` left ≥ 84.
  - `sidebar pinned panels don't overlap` (Review Focus 2): check `#lm_button_panel_pin` + open AI Settings → `#left-nav-panel` left ≥ 84.
  - `sidebar mobile falls back`: viewport 375×812 → `#top-settings-holder` y === 0 and width === 375.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**; lint.
- [ ] **Step 5: Commit** `feat(ui): getting-started checklist and sidebar style`.

### Task 5: Basic / Advanced settings

**Files:** Create `public/scripts/ux/ux-basic.js`; modify `ux-modes.js` (calls `applyBasicMode` from `setBasicSettings`), `ux-modes.css`, test file.

**Interfaces — Produces:**
- `export const ADVANCED_SETTING_SELECTORS: string[]`: container selectors (the nearest wrapper that holds label + control) for, in the AI Response Configuration panel: typical P, TFS, top A, top K (text completion), epsilon/eta cutoff, rep-pen range, rep-pen slope, frequency/presence penalty (text completion), no-repeat-ngram, Mirostat block, DRY block, XTC block, dynamic temperature block, smoothing block, CFG block, grammar / JSON schema blocks, logit bias block, banned tokens, sampler priority, seed, and in the chat-completion panel: top K, top A, min P, frequency/presence penalty, logit bias, seed, `n`. Implementer finds each wrapper's existing ID/class in `index.html`; no IDs are added to existing elements. If a wrapper has none, the selector uses `:has(#control_id)`.
- `export function applyBasicMode(enabled: boolean): void`: toggles class `uxAdvanced` on every match (CSS `body.ux-basic .uxAdvanced { display: none !important }`). Then, for each `.drawer-content` and each `.inline-drawer-content` containing at least one *otherwise-visible* hidden match, it inserts or updates a single `.uxHiddenNote` at the top: "{n} advanced settings hidden · Show". Clicking "Show" calls `setBasicSettings(false)`. Notes are removed when disabled. Re-run on `main_api` change (`#main_api` change event) and on `event_types.SETTINGS_LOADED_AFTER`.
- Never touches `selectedSamplers` / `samplerSelect.js` data.

- [ ] **Step 1: Failing tests:**
  - `hides mirostat, keeps temperature`: basic on, text completion API → Mirostat container hidden; `#temp_textgenerationwebui` visible.
  - `hidden note with count` (Review Focus 4): basic on → `#left-nav-panel .uxHiddenNote` visible and its number equals the count of `.uxAdvanced` hidden in that panel that would otherwise be visible.
  - `show restores`: click the note's Show → `ui_basic_settings === false`, Mirostat visible, notes gone.
  - `values untouched`: record `JSON.stringify(textgenerationwebui_settings)` and `oai_settings`; toggle basic on/off → strings equal.
  - `search reveals basic-hidden`: basic on → `revealSetting(mirostat element)` → basic off, element visible.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**; lint.
- [ ] **Step 5: Commit** `feat(ui): basic/advanced settings switch`.

### Task 6: Whole-app check

- [ ] Run the whole new test file and the existing frontend suite: `cd tests && ST_BASE_URL=http://127.0.0.1:8123 npx playwright test frontend/` → all pass.
- [ ] In the browser pane, screenshot every style × Basic on/off at 1366×800 and 375×812; open each drawer once in each style; confirm Classic matches the release branch screenshot.
- [ ] `npm run lint` clean. Commit any fixes.
