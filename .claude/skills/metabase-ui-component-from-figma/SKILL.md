---
name: metabase-ui-component-from-figma
description: Update or build a Metabase design-system component (frontend/src/metabase/ui — Chip, Badge, Alert, Switch, etc.) to match a Figma spec described in a Linear issue. Use when a ticket asks to restyle/implement a `metabase/ui` component from Figma. Covers: checking out the issue, mapping usage and blast radius into a findings doc, building a Storybook showcase matrix FIRST, then styling the component from exact Figma tokens while iterating with the user, and committing + migrating call sites LAST.
---

# Metabase UI component from Figma

End-to-end workflow for bringing a `metabase/ui` (Mantine) component in line with a Figma design, driven by a Linear ticket. The phases are **ordered on purpose** — story before styling, styling before commit. Do not reorder them.

The golden rule: **build the Storybook showcase while the component still has its old styles, and only start changing component styles once the showcase exists.** The showcase is how you (and the user) judge the restyle at a glance and is a candidate visual-regression test.

This is a frontend task — also load **typescript-write** (and **typescript-review** before handing off). Worked reference: this skill was distilled from Chip component implementation. Concrete Chip details appear as examples — adapt them per component.

---

## Phase 1 — Check out the issue

1. The user gives a Linear issue (link or `TEAM-1234`). Fetch it with the Linear MCP `get_issue`.
2. From the issue pull:
   - **Figma link(s)** — usually in the description. Extract the `node-id` (e.g. `?node-id=250-13588` → `250-13588`) and `fileKey` (the `/design/<fileKey>/...` segment).
   - **`gitBranchName`** — the branch Linear associates with the issue.
   - **Requirements** — e.g. "we use the `sm` and `md` sizes" / "the `light` and `filled` variants". These define the axes of your showcase matrix.
3. Switch to the issue's branch if not already on it (`git rev-parse --abbrev-ref HEAD` to check; it may already match).

## Phase 2 — Map usage & blast radius (findings doc)

Before touching anything, find where the component is defined and used, and write it down.

1. Locate the component dir. A design-system component lives in `frontend/src/metabase/ui/components/<group>/<Component>/` — typically `Component.config.ts`, `Component.module.css`, `Component.stories.tsx`, `index.ts`. But the ticket may be **migrating a legacy component** that still lives in `frontend/src/metabase/common/components/<Component>/` (older patterns, possibly Emotion styled-components, maybe not yet a Mantine wrapper). If so, part of the work is bringing it into `metabase/ui` — confirm the target location with the user, and reach for the **emotion-migrate** skill if you're replacing styled-components along the way.
2. Find every usage across `frontend/src` and `e2e` (JSX `<Component`, `Component.Group`, wrapper components like `Form<Component>Group`). Watch for false positives (a CSS class named `…ChipClass` is not the component).
3. Write findings to **`local/<TICKET>-<component>-usage-findings.md`** (`local/` is gitignored). For each finding record:
   - code location (`file:line`),
   - short usage context,
   - **non-standard usage notes** — excessive customization, inline styling, or invalid props. (Chip example: every call site passed `variant="brand"`, which is **not** a real Mantine Chip variant — it was a no-op overridden by CSS. Catching this early told us the call sites would need migrating in Phase 6.)
4. **This document stays.** It is not a scratch file — the user reads it at the very end to manually verify every usage still looks right after the restyle. Keep it accurate; update it if call sites change.

State the blast radius plainly: how many call sites, where, and whether they're confined (e.g. "only two admin forms, via the `FormChipGroup` wrapper").

## Phase 3 — Build the Storybook showcase FIRST

Goal: a single story that shows **every state at a glance**, themeable, and suitable to become a Loki visual-regression test. The component still has its OLD styles here — that's expected; the showcase will "light up" once you restyle in Phase 4.

### Reusable showcase helpers

Shared, Storybook-only primitives live in **`frontend/src/metabase/ui/stories/showcase/`** (not under `components/`, so they never leak into the `metabase/ui` barrel). Reuse them across component stories; extend the set when a new pattern is genuinely reusable (don't over-build):

- `StoryShowcase` — bordered `Paper` panel + a title.
- `StorySection` — a titled section with an optional description line.
- `StoryRow` — fixed-width label on the left + content on the right.
- `StoryJsx` — monospace JSX with light syntax highlighting (a small regex tokenizer, `tokenizeJsx`, distinguishing `<>/=`, tag, prop name, prop value; tokens rendered as plain `<span>`s with `--mb-color-*` colors — `text-syntax-variable` for prop names, `text-syntax-string` for values, `text-secondary` for punctuation).

### Matrix shape is GUIDED BY FIGMA, not fixed

The Chip matrix was `variant × size × state`, but **the axes depend on the component**:
- Some components have no interactive states — e.g. an **Alert** has no hover/pressed, but may have several variants and an icon. Don't invent axes Figma doesn't show.
- Read the Figma spec to decide the axes (variants, sizes, states, with/without icon, etc.).

Typical layout (mirrors how the Figma component sheet is usually drawn):
- A **title** (`StoryShowcase title="Chip"`).
- A single **CSS-grid matrix**: the left column holds the state labels (one per row — Default, Hover, Pressed, Selected, …), then **one column per axis-combination** (e.g. `variant × size`: light·sm, light·md, filled·sm, filled·md). Each column is headed by the real JSX usage via `StoryJsx` (e.g. `<Chip variant="light" size="sm" />`), so the header states the props explicitly and the state label appears only once on the left. Use `gridTemplateColumns: \`<labelWidth> repeat(N, max-content)\`` and `React.Fragment` per row.

### Theme: use the global toggle, render ONE copy

Render the showcase **once** and let Storybook's global `theme` control (light/dark, defined in `.storybook/preview.tsx`) switch it. Do **not** try to render light and dark panels side by side: Metabase bakes per-scheme hex into `--mantine-color-*` at `:root`, and Mantine color tokens (`c="text-primary"`, `color="brand"`) follow the global scheme.

### Forcing hover/pressed for the matrix

Use **`storybook-addon-pseudo-states`** (installed, registered in `.storybook/main.ts`). It works fine with Mantine's internal slots **if you point it at the right element**. Do NOT add `data-force-*` selectors to the component CSS; keep production CSS free of Storybook-only hooks.

How the addon rewrites `:hover` (and `:active`, `:focus`, …):
- it adds, to every rule containing `:hover`, an extra selector — both a **compound** form (`<rule>.pseudo-hover`, the class on the *exact element* the `:hover` sat on) and an **ancestor** form (`.pseudo-hover-all <rule>`).
- `parameters.pseudo = { hover: true }` → toggles `.pseudo-hover-all` on the story root (forces *every* hover rule in the story).
- `parameters.pseudo = { hover: "<selector>" }` (string/array) → applies the **compound** form, i.e. `.pseudo-hover` on the element matching `<selector>`. **That selector must match the element the `:hover` rule attaches to.**

Two gotchas that bit us on Chip, both essential:
1. **Target the slot the pseudo-class lives on, not the root.** Chip's `:hover`/`:active` sit on the `label` slot (`.ChipLabel`), so per-row selectors must reach it: `` `[data-state-row="${id}"] .${S.ChipLabel}` `` — import `S` from the component's `.module.css` to get the hashed class. Targeting the root or a wrapper silently does nothing.
2. **Land your hook on the root, not the hidden input.** Mantine forwards top-level `data-*` (and most rest props) to the hidden `<input>`, *not* the root element. Use the factory's dedicated root-props slot — for Chip that's `wrapperProps={{ "data-state-row": id }}`. (Check the component's `.d.ts` for the equivalent slot — `wrapperProps`, `rootProps`, etc.)

So: give each cell a stable `data-*` on its root via the proper slot, then in the story's `parameters.pseudo` map the forced rows to `[data-… ] .<SlotClass>` selectors. The toolbar toggle still works independently (it uses the `-all` ancestor form).

### Story conventions

- Keep an interactive `Default` story plus the matrix story (e.g. `Overview`).
- Restricting `argTypes` (e.g. `size: ["sm", "md"]`) to what the ticket supports is good.
- **Scope controls per story.** `argTypes`/`args` merge meta → story, so a static matrix story should hide knobs it ignores: `parameters.controls = { include: ["children", "theme"] }` (or `{ disable: true }` to drop the panel entirely). The matrix usually fixes `variant`/`size`/`disabled` per cell, leaving only the label `children` and the global `theme` meaningful — wire `children` through to every cell so that knob actually does something.
- `loki.config.js` has a `storiesFilter`; renaming stories can affect Loki. Check before renaming a story that's already in the filter.

Validate the story before moving on:
- `bun run lint-eslint-pure -- <files>`
- `bun run type-check-pure`

### Optional: verify in the browser yourself

If a browser-driving MCP is connected (e.g. **chrome-devtools-mcp** — tools like `new_page`, `navigate_page`, `take_snapshot`, `take_screenshot`, `evaluate_script`, `resize_page`), use it to check your own work against the running Storybook instead of relying solely on the user's eyes:

- Open the story canvas directly: `http://localhost:6006/iframe.html?id=<story-id>` (the id is the kebab-cased title + story, e.g. `components-ask-before-using-chip--overview`), or the full UI at `…/?path=/story/<story-id>`. Storybook is usually already running — don't start it yourself.
- `take_screenshot` for a visual read; `resize_page` (e.g. 1600×1000) first if a wide matrix is clipped.
- `take_snapshot` / `evaluate_script` to inspect the real DOM — confirm a `data-*` hook landed on the **root** (not the hidden input), that the pseudo-states classes were applied, or read a computed style / resolved `--mb-color-*` on a specific cell.

This is a **convenience, never a requirement.** If no such MCP is connected, just rely on the user's visual check — and you may mention that installing one (the chrome-devtools-mcp plugin) would let you self-verify layout/DOM in future. Don't block on it. (File writes from these tools may be sandboxed to the repo root — save a screenshot under `local/` and `mv` it elsewhere if needed.)

Pause here and let the user look at the showcase. Iterate on layout/spacing only — **no component style changes yet.**

## Phase 4 — Style the component from Figma

Only now do you change `Component.config.ts` / `Component.module.css`. Get **exact tokens from Figma** — do not eyeball hex from screenshots.

### Figma desktop MCP is required for tokens

`get_screenshot` works by `nodeId`, but `get_variable_defs`, `get_design_context`, and `get_metadata` read the **current selection in the Figma desktop app** via the **Dev Mode MCP server**.

- If those tools error with "You currently have nothing selected" or the desktop MCP isn't connected, **prompt the user** to:
  1. enable the Dev Mode MCP server in Figma desktop (Switch to Dev Mode → Find MCP section in right sidebar) and add it as a local MCP if needed, and
  2. **select the relevant layer(s)** when you ask. You'll often ask them to select a representative component variant; you can then drill into specific state nodes by `nodeId`.
- Do **not** spend many turns pixel-sampling a screenshot as a substitute — it's unreliable and wastes the budget. Get the user to wire up the desktop MCP instead.

### Extracting and mapping tokens

1. `get_metadata` on the spec frame to get the node id + name of every `Theme=… , Variant=… , Size=… , State=…` symbol.
2. `get_variable_defs` per state symbol for exact colors, spacing, radius, font.
3. `get_design_context` (forceCode) on one symbol for exact CSS dims (padding, gap, icon size). It may interrupt asking about Code Connect — you can skip that.
4. **Use the semantic token names `get_variable_defs` returns.** An up-to-date spec binds each color property to a semantic token (a role like `text/hover`, `background/selected`) — match it to the corresponding `--mb-color-*` key (key list: `frontend/src/metabase/ui/colors/types/color-keys.ts`) and use it directly; one definition then works in both themes. To sanity-check a token resolves to the shade you expect, read `frontend/src/metabase/ui/colors/constants/themes/light.ts` / `dark.ts` (semantic token → base ramp per scheme) and `base-colors.ts` (ramp → hsla). Caveat: `get_variable_defs` returns mode-aware *values* that may be the wrong mode for dark symbols — trust the variable **names**, not the returned hex for dark. If a property is bound to a **primitive ramp** instead of a semantic token, see the guardrail below.

### Color rules — semantic tokens only, NO `color-mix`, NO primitives

CSS modules **must not** use `color-mix` to fake transparency/shade of a variable, and literal hex is banned — see `docs/developers-guide/frontend.md` ("Colors"). Every color in the component must be a **semantic** `--mb-color-*` token (the full key list is `frontend/src/metabase/ui/colors/types/color-keys.ts`).

**Guardrail — flag primitive tokens in the spec.** Up-to-date Figma designs should already bind to semantic tokens, so `get_variable_defs` should return semantic names. If you instead see **raw ramp / primitive tokens** (e.g. `Orion-Alpha/10`, `Ocean/60`, `Palm/40` — a color ramp + number, not a role) bound directly to a property:

- **Do not** translate them to a ramp yourself, hardcode the hex, or `color-mix` your way to the shade. Implementing a component against primitives directly is not advisable.
- **Stop and flag it to the user** — that's a design-side gap to resolve with the design team (bind the property to a semantic token, or add a token if one is missing). Note which property/state uses the primitive so the conversation is concrete.
- Resume once the spec exposes a semantic token (as happened on Chip for hover/selected/disabled).

### Mantine wiring gotchas (verified on Chip)

- **`data-variant` is on the ROOT** (`Box`), not the label. `data-checked` and `data-disabled` are on the label. Scope variant rules through a root class: `classNames.root` → `.ChipRoot[data-variant="filled"] .ChipLabel[data-checked]…`.
- **Beat Mantine's built-in variant CSS.** It paints the unchecked label background at `.m_*:not([data-disabled])` specificity (0,2,0). Your rules must out-specify it — scoping through the root class (descendant combinator) gets you there (unchecked 0,3,0, hover 0,4,0, selected 0,5,0, selected-hover 0,6,0).
- **Avoid chained `:not()`** — stylelint's `selector-not-notation: complex` rejects `:not(a):not(b)`, and combining into `:not(a, b)` *lowers* specificity. Gain specificity via the root class / attributes instead.
- **Sizes via a `vars` resolver**, returning only Mantine's typed Chip vars (`--chip-size`, `--chip-padding`, `--chip-fz`, etc.) — custom var names fail type-check. Map size → those vars in `Component.config.ts`.
- **Built-in icons** use `currentColor` (Mantine `CheckIcon` is `fill: currentColor`), so the icon inherits the label color automatically. Un-hide the `iconWrapper` if a prior config hid it.
- For text-on-brand-fill, follow the existing convention (`Button` filled uses `--mb-color-text-primary-inverse`) unless the user wants it forced white; flag the dark-theme implication.

Run `npx stylelint <css>`, `LINT_CSS_MODULES=true bun run lint-eslint-pure -- <files>`, and `bun run type-check-pure` after edits.

## Phase 5 — Iterate with the user

Show the result in the user's running Storybook and **address feedback** — a color slightly off, a missing/extra state, spacing, radius, shadow, etc. Surface deliberate deviations explicitly (e.g. "filled-selected text uses `text-primary-inverse` for whitelabel safety, which is dark in dark mode vs Figma's white — want me to force white?"). If a browser MCP is connected (see Phase 3's "verify in the browser yourself"), screenshot the restyled matrix in both themes to catch issues before the user does. Keep iterating; **do not commit until the user is satisfied.**

## Phase 6 — Commit, then migrate call sites

Only after the user signs off on the Storybook state:

1. Commit (the user must explicitly ask; commit only what's relevant — exclude build artifacts like `*.hot-update.*` and the gitignored `local/` doc). Follow the user's commit conventions.
2. **Update call sites** flagged in Phase 2 if the restyle requires it — e.g. migrate invalid/renamed props (Chip: `variant="brand"` → `variant="filled"`). When doing bulk find/replace, be surgical: a blanket `variant="brand"` → `variant="filled"` also hits unrelated components (it caught two `FormSubmitButton`s on Chip) — verify each replacement is actually the target component and revert the rest.
3. **Leave the findings doc in place.** The user walks through it to manually verify every real usage looks correct in the running app after the change.

---

## Checklist

- [ ] Linear issue fetched; Figma node/fileKey + `gitBranchName` extracted; on the right branch.
- [ ] Usage + blast radius written to `local/<TICKET>-<component>-usage-findings.md` (kept for final verification).
- [ ] Storybook showcase matrix built (axes guided by Figma), single panel + global theme toggle, hover/pressed forced via `storybook-addon-pseudo-states` (`parameters.pseudo` selectors aimed at the pseudo-class's slot, hook landed on the root via the factory's root-props slot), controls scoped per story; lint + type-check pass. **Component styles untouched.**
- [ ] Figma desktop MCP available (prompt user to enable + select if not); exact tokens extracted and mapped to semantic `--mb-color-*` (NO `color-mix`, NO primitive ramp tokens — flag any primitive/missing token to the user for design to resolve).
- [ ] Component styled (config + CSS); stylelint + eslint(+CSS modules) + type-check pass.
- [ ] Iterated with the user until satisfied.
- [ ] Committed (when asked); call sites migrated and verified; findings doc handed back for manual verification.
