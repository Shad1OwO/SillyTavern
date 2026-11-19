# Selectable interface styles for SillyTavern — design

Date: 2026-11-19
Status: draft, awaiting approval

## Intent

The user finds SillyTavern's interface hard to use but can't pin down one cause.
Running the app as a new user turned up five concrete problems:

1. The top bar is 9 unlabeled icons; their names are only in hover tooltips (no hover on phones).
2. New users get no guided path; the welcome popup says "aimed at advanced users", and nothing points to "connect an AI" as the step that makes chatting work.
3. The AI Response Configuration panel shows every sampler at once, so common settings (Temperature) sit next to niche ones (Mirostat, Rep Pen Slope).
4. Settings search only covers the User Settings panel.
5. Toasts (top-center by default) cover the drawer you just opened.

The user asked for **all three proposed directions** (A: polish, B: Basic/Advanced
switch, C: redesigned layout) **with a selectable button**, so each person picks
the experience they want and nobody is forced into a change.

## Goals

- An **Interface style** choice with three options:
  - **Classic**: today's UI, pixel-identical.
  - **Enhanced** (direction A): labeled top bar, search across every panel, getting-started checklist, toasts that don't cover drawers, slightly roomier spacing.
  - **Sidebar** (direction C): everything in Enhanced, but navigation moves to a labeled vertical rail on the left (desktop), with drawers opening beside it.
- A separate **Basic / Advanced settings** switch (direction B) that works in any style and folds rarely used settings behind a "Show advanced" control.
- Every feature and setting stays reachable in every combination.

## Non-goals

- Removing, renaming, or moving any setting's underlying storage, preset format, or slash command.
- Changing element IDs or the DOM structure that extensions and custom CSS rely on.
- Translating new strings into all locales (English strings get i18n keys; other locales fall back to English).
- Redesigning individual panels' internals (e.g. the Prompt Manager, World Info editor).

## Anti-goals (failure even if it "works")

- Classic looks or behaves differently from today in any way.
- Any setting becomes unreachable in Basic mode with no visible way back.
- An installed extension's button, panel, or drawer stops working in Enhanced or Sidebar.
- The style switch requires a page reload or loses unsaved input.

## Constraints found in the code

- Navigation is the `#top-settings-holder` bar of `.drawer` elements, toggled by `doNavbarIconClick` (`public/script.js:10953`). Extensions add their own drawers and buttons into this DOM, and custom themes target its IDs and classes. **Both new styles must restyle the existing DOM (body class plus CSS, plus a little JS), never rebuild it.**
- UI preferences live in `power_user` (`public/scripts/power-user.js`), saved through `saveSettingsDebounced`, and applied with body classes (e.g. `no-blur`, `movingUI`). New settings follow the same pattern.
- Toast position is already a user setting (`power_user.toastr_position`, default `defaultToastPosition`, applied at `power-user.js:1078`).
- A **Sampler Select** feature already exists (`public/scripts/samplerSelect.js`, `#samplerSelectButton`) but covers only text-completion APIs. Basic mode sits on top of it and never writes to its data.
- The welcome screen is template-driven (`public/scripts/templates/welcome.html`, `welcomePanel.html`, `public/scripts/welcome-screen.js`) and already has "drawer-opener" buttons to reuse.
- `index.html` is ~8,200 lines with API-specific sections that are shown or hidden depending on the active API.

## Approaches considered

| | What it is | Trade-off |
|---|---|---|
| A. Polish | Labels, global search, checklist, toast fix, spacing | Low risk, keeps all IDs; less dramatic |
| B. Basic/Advanced | Fold niche settings behind a toggle | Calming for newcomers; "what's advanced" is a judgment call across ~15 APIs |
| C. Full redesign | New navigation and settings page | Biggest visual change; a rebuilt DOM would break themes and extensions |

**Picked by the user: all three, selectable.** To make C safe, it is built as a
*restyle* of the existing DOM (the Sidebar style) rather than a new DOM, so
extensions keep working. Custom themes written for Classic may look off in
Sidebar; that's acceptable because it's opt-in.

## Design

### 1. The selectable buttons

- **Interface style**: a three-button segmented control (Classic / Enhanced / Sidebar), each with a one-line description. It appears in:
  - User Settings → UI Theme section (permanent home);
  - the welcome screen (so new users see it first).
  Switching applies instantly via body classes `ux-enhanced` / `ux-sidebar` (Classic has neither) and saves to `power_user.ui_style` (`'classic' | 'enhanced' | 'sidebar'`).
- **Basic / Advanced settings**: a two-state toggle button at the top of the AI Response Configuration panel (and mirrored in User Settings), saved to `power_user.ui_basic_settings` (boolean). Body class `ux-basic`.
- Both are reachable from the slash command `/ui-style classic|enhanced|sidebar` and `/ui-basic on|off` so keyboard users and scripts can switch too. *(My call: consistent with how other UI toggles are exposed.)*
- **Defaults**: `ui_style = 'classic'`, `ui_basic_settings = false`, so existing users see no change after updating. *(My call: protects existing users; new users are offered the choice on the welcome screen.)*

### 2. Enhanced style (A)

- **Labeled top bar**: each top-bar icon gets a short text label beneath it (AI Settings, API, Formatting, World Info, Settings, Backgrounds, Extensions, Persona, Characters), built from the existing i18n titles. The active drawer's icon and label are highlighted. Extension-added top-bar icons get their `title` as a label automatically. Below ~700px width, labels shrink; if they still don't fit, labels hide and the open drawer shows its name as a header instead.
- **Search everywhere**: a search button in the top bar (and `Ctrl+K` / `Cmd+K`) opens a search popup. As you type, it lists matching setting labels and section headers from **all** drawers, each with its panel name. Choosing a result opens that drawer, expands any collapsed sections containing it, scrolls to it, and briefly highlights it. Settings hidden because they belong to another API are excluded; settings hidden by Basic mode are included and, when chosen, revealed. The existing User Settings search box keeps working as-is.
- **Getting-started checklist** on the welcome screen: three steps with live check marks — set your persona name, connect an API (done when connected), pick a character. Each step's button opens the right drawer. Dismissible; once dismissed it stays hidden (`power_user.ui_checklist_dismissed`).
- **Toasts out of the way**: while the user's toast position is still the default, Enhanced and Sidebar show toasts bottom-right. Any position the user picked themselves is respected.
- **Roomier spacing**: larger tap targets on the top bar and menu buttons; a little more spacing between rows in drawers. CSS only, scoped to `.ux-enhanced` / `.ux-sidebar`.

### 3. Sidebar style (C)

Includes everything in Enhanced, plus:

- On desktop (≥1000px) the top bar becomes a fixed vertical rail on the left with icon and label stacked, plus the search button at the top.
- Drawers open as panels to the right of the rail instead of dropping down from the top. The two pinnable side panels (AI Response Configuration, Character Management) shift to account for the rail width.
- The chat column uses the remaining width.
- On phones and narrow windows (<1000px), Sidebar falls back to the Enhanced layout.

### 4. Basic / Advanced settings (B)

- In Basic mode a curated list of advanced controls is hidden with a CSS class. The list lives in one JS module as selectors grouped by API, so it's easy to review and extend.
- Basic keeps visible, per API family: response length, context size, temperature, top P, min P (where supported), repetition penalty (where supported), streaming, presets, and API/model selection. Everything else in AI Response Configuration (Mirostat, typical P, TFS, top A, rep-pen range/slope, DRY, XTC, grammar, logit bias, CFG, etc.) counts as advanced. *(Initial list is my call; to be reviewed in the PR.)*
- Each panel that hides something shows a line, "N advanced settings hidden · Show", so nothing disappears silently. Clicking it switches Basic off.
- Basic mode only hides elements; it never changes a value. Presets and generation behave identically in either mode.

## Verification

- Visual check in the running app for each style × Basic on/off, at desktop (1366×800) and phone (375×812) widths.
- Classic is compared against the release branch with screenshots to confirm it is unchanged.
- Smoke test: opening every drawer, an extension's drawer, settings search jumps, and switching styles without a reload.
- `npm run lint` passes.

## Left to the builder

- Exact label wording and the breakpoints.
- How the search index is built (scan at open time vs. cache) as long as it feels instant.
- Exact CSS for the rail and panel offsets.
- The precise selector list for Basic mode, following the rule in §4.
