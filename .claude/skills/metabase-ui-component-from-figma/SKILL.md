---
name: metabase-ui-component-from-figma
description: Update or build a Metabase design-system component (frontend/src/metabase/ui — Chip, Badge, Alert, Switch, etc.) to match a Figma spec described in a Linear issue. Use when a ticket asks to restyle an existing `metabase/ui` component or implement a new one from Figma. Covers: checking out the issue, mapping the component (usage/blast radius for an existing one, or scaffolding a new one), building a Storybook showcase matrix (before styling for existing components, after for new ones), styling from exact Figma tokens while iterating with the user, and committing + migrating call sites LAST.
---

# Metabase UI component from Figma

End-to-end workflow for bringing a `metabase/ui` (Mantine) component in line with a Figma design, driven by a Linear ticket. 

The golden rule (existing components): **build the Storybook showcase before changing any component styles.** Build it while the old styles are still in place — so the team can see the current component at a glance and get accustomed to it before the migration, then watch it light up as you restyle. You end up with a visual-regression (Loki) candidate either way. A **new** component has nothing to render until it's built, so this rule doesn't apply to create mode — there the order flips: implement and style the component first, then build its showcase to present the result.

This is a frontend task — also load **typescript-write** (and **typescript-review** before handing off).

## Two modes

The ticket is one of two shapes; identify which up front, because Phase 2 differs:

- **Update an existing component** — the component already exists with call sites, either in `metabase/ui` *or* as a legacy component elsewhere (e.g. `frontend/src/metabase/common/components/`, possibly Emotion styled-components) that this ticket also migrates into `metabase/ui`. The risk is *regression* (call sites, behavior), so you map usage and lock behavior with tests before touching it.
- **Create a new component** — nothing equivalent exists anywhere yet. Rarer. The risk is *API design*, so you scaffold the component and its public surface first.

Phases 1, 2, 5 and 6 are shared. The middle two differ in **order**: update mode builds the showcase (Phase 3) *before* styling (Phase 4); create mode does the reverse — implement and style first, then build the showcase as the last step — because there's nothing to render until the component exists.

---

## Phase 1 — Check out the issue

1. Fetch the Linear issue with the Linear MCP `get_issue`.
2. Pull from it:
   - **Figma link(s)** — extract the `node-id` (`?node-id=250-13588` → `250-13588`) and `fileKey` (the `/design/<fileKey>/…` segment).
   - **`gitBranchName`** — switch to it if not already there.
   - **The component's intended API** — variants, sizes, and states the design system supports for this component. This defines the axes of your showcase (Phase 3).
3. Decide the mode (see **Two modes** above): search for an existing component — in `metabase/ui` or as a legacy component elsewhere. Found → **update**; nothing equivalent anywhere → **create**. Confirm with the user when unsure.
4. **Verify a Figma desktop MCP is connected before doing the work** — this skill depends on it for exact tokens in Phase 4 (and styling can't proceed accurately without it). Do a quick read against the issue's node (e.g. `get_metadata`/`get_variable_defs`); if it errors with "nothing selected" or the server isn't connected, prompt the user to enable it (Switch to Dev Mode → MCP section in the right sidebar) and select the relevant layer before continuing.

## Phase 2 — Understand the component

### Mode: update an existing component

1. Locate the component dir (typically containing `Component.config.ts` or `Component.tsx`, `Component.module.css`, `Component.stories.tsx`, `index.ts`). A ticket may also be **migrating a legacy component** — if it still uses Emotion styled-components, reach for the **emotion-migrate** skill.
2. Map every usage across `frontend/src` and `e2e` (JSX `<Component`, sub-components like `Component.Group`, and wrapper components).
3. Write findings to **`local/<TICKET>-<component>-usage-findings.md`**, one entry per usage: code location (`file:line`), short context, and **non-standard usage** (excessive customization, inline styling, invalid/legacy props). Invalid props are a signal that call sites will need migrating in Phase 6. This doc **stays** — the user walks it at the end to verify each real usage still looks right.
4. State the blast radius plainly: how many call sites, where, and whether they're confined.
5. **Lock behavior with tests before changing anything — when warranted.** Only for components that have **custom interactive behavior** (their own event handlers, state, keyboard logic, controlled/uncontrolled wiring). Add unit tests covering that current API/behavior so a regression shows up as a failing test. **Skip tests for thin Mantine wrappers** — don't test built-in Mantine behavior, and a pure visual restyle is covered by the showcase/Loki, not unit tests.

### Mode: create a new component

1. Decide whether it wraps a Mantine primitive (most common — extend it via a `.config.ts` using `<Mantine>.extend({...})` and theme registration) or is bespoke. Prefer wrapping Mantine.
2. Scaffold the component dir + its public surface: `Component.tsx`/`Component.config.ts`, `Component.module.css`, `Component.stories.tsx`, `index.ts`, and wire the export through the group barrel and the `metabase/ui` barrel.
3. There are no call sites to map yet; instead note the intended usage from the ticket so the eventual showcase reflects real props.
4. **Order note:** for a new component, implement and style it (Phase 4) first, *then* build the showcase (Phase 3) to present the finished result — there's nothing to render until it exists. The phases below are written update-first; just run 4 before 3 in create mode.

## Phase 3 — Build the Storybook showcase

Goal: one story that shows **every state at a glance**, themeable, suitable as a Loki visual-regression test. **Update mode: build this before Phase 4, while the old styles are still in place. Create mode: do this after Phase 4**, once the component exists to render.

### Reusable showcase helpers

Use the shared, Storybook-only primitives in **`frontend/src/metabase/ui/stories/showcase/`**: `StoryShowcase` (titled panel), `StorySection`, `StoryRow`, and `StoryJsx` (monospace JSX with light syntax highlighting via `tokenizeJsx`). Extend the set only when a new pattern is genuinely reusable.

### Derive the matrix from the component's full state space

Enumerate **all** the states the component can be in — every supported variant, size, and interaction/selection state (from its props/types and the design-system API, not merely the subset the issue happens to mention) — then cross-reference with the Figma spec and build the matrix on that. Don't omit a supported state because the ticket didn't list it; don't invent an axis Figma doesn't show (e.g. a static component has no hover/pressed).

**Exclude theme from the matrix.** Figma usually models light/dark as a component *property* (because it doesn't use variable modes), but theme is **not** a real component prop in the app — it's global. So never make theme a matrix axis or column; drive light/dark with the global Storybook `theme` toggle instead (see below).

Typical layout (mirrors the Figma component sheet): a `StoryShowcase` title, then a single **CSS-grid matrix** — state labels down the left column, one column per axis-combination (e.g. `variant × size`), each column headed by the real JSX usage via `StoryJsx`. Use `gridTemplateColumns: \`<labelWidth> repeat(N, max-content)\`` with a `React.Fragment` per row.

### Theme: use the global toggle, render ONE copy

Render the showcase once and let Storybook's global `theme` control (defined in `.storybook/preview.tsx`) switch light/dark. Do **not** render light and dark side by side: Metabase bakes per-scheme hex into `--mantine-color-*` at `:root`, and Mantine color tokens follow the global scheme — a nested scheme wrapper won't re-scope them.

### Forcing hover/pressed for the matrix

Use **`storybook-addon-pseudo-states`** (registered in `.storybook/main.ts`); don't add `data-force-*` hooks to component CSS. Set `parameters.pseudo` to force states per cell. Two things make or break it:

1. **Aim the selector at the element the pseudo-class actually sits on**, which for a Mantine component is often an inner slot, not the root. A string/array value applies `.pseudo-<state>` to the matched element, so it must match that slot. Import the CSS-module class (`S.<Slot>`) to target it.
2. **Land your per-cell hook on the root via the factory's root-props slot** (e.g. `wrapperProps`), because Mantine forwards top-level `data-*`/rest props to an inner element, not the root. Check the component's `.d.ts` for the right slot.

The addon toolbar toggle keeps working independently (it forces every rule in the story).

### Example: a finalized matrix story

Illustrative — adapt the axes and states to the component you're working on. This is the shape the pieces above add up to (state labels on the left, one column per `variant × size`, forced hover/pressed via `parameters.pseudo`, the root hook on `wrapperProps`, controls scoped to the meaningful knobs):

```tsx
import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Box, Chip, type ChipProps, Text } from "metabase/ui";
import { StoryJsx, StoryShowcase } from "metabase/ui/stories/showcase";

import S from "./Chip.module.css";

// Axes derived from the component's API (here: variant × size).
const COLUMNS = [
  { variant: "light", size: "sm" },
  { variant: "light", size: "md" },
  { variant: "filled", size: "sm" },
  { variant: "filled", size: "md" },
] as const;

// Every state the component supports; `id` doubles as the pseudo-state hook.
const STATES = [
  { id: "default", label: "Default" },
  { id: "hover", label: "Hover" },
  { id: "pressed", label: "Pressed" },
  { id: "selected", label: "Selected", checked: true },
  { id: "hover-selected", label: "Hover selected", checked: true },
  { id: "disabled", label: "Disabled", disabled: true },
];

// Force hover/pressed by targeting the slot the pseudo-class sits on (.ChipLabel).
const labelSelector = (id: string) => `[data-state-row="${id}"] .${S.ChipLabel}`;

const Overview: StoryFn<ChipProps> = ({ children }) => (
  <StoryShowcase title="Chip">
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `9rem repeat(${COLUMNS.length}, max-content)`,
        columnGap: "2rem",
        rowGap: "1rem",
        alignItems: "center",
      }}
    >
      <div />
      {COLUMNS.map(({ variant, size }) => (
        <StoryJsx
          key={`${variant}-${size}`}
        >{`<Chip variant="${variant}" size="${size}" />`}</StoryJsx>
      ))}
      {STATES.map((state) => (
        <Fragment key={state.id}>
          <Text size="sm" c="text-secondary">
            {state.label}
          </Text>
          {COLUMNS.map(({ variant, size }) => (
            <Chip
              key={`${variant}-${size}`}
              wrapperProps={{ "data-state-row": state.id }} // hook on the ROOT
              variant={variant}
              size={size}
              checked={state.checked ?? false}
              disabled={state.disabled ?? false}
              onChange={() => {}}
            >
              {children}
            </Chip>
          ))}
        </Fragment>
      ))}
    </Box>
  </StoryShowcase>
);

export const OverviewStory = {
  render: Overview,
  parameters: {
    pseudo: {
      hover: ["hover", "hover-selected"].map(labelSelector),
      active: ["pressed"].map(labelSelector),
    },
    controls: { include: ["children", "theme"] },
  },
};
```

### Story conventions

- Keep an interactive default story plus the matrix story.
- Restrict `argTypes` to the supported API (e.g. only the sizes the DS uses).
- **Scope controls per story.** A static matrix should hide knobs it ignores: `parameters.controls = { include: [...] }` (or `{ disable: true }`). Wire any kept knob (e.g. `children`) through to the cells so it does something.
- `loki.config.js` has a `storiesFilter`; check it before renaming a story that's already covered.

Validate: `bun run lint-eslint-pure -- <files>` and `bun run type-check-pure`.

### Optional: verify in the browser yourself

If a browser-driving MCP is connected (e.g. **chrome-devtools-mcp** or **playwright-mcp**: `navigate_page`, `take_screenshot`, `take_snapshot`, `evaluate_script`, `resize_page`), use it to check your own work against the running Storybook (`http://localhost:6006/iframe.html?id=<story-id>`, the kebab-cased title + story). Screenshot for a visual read; `evaluate_script`/`take_snapshot` to confirm DOM facts (a hook landed on the root, pseudo classes applied, a resolved `--mb-color-*`). This is a **convenience, never a requirement** — without it, rely on the user's visual check (and you may suggest installing the plugin). Storybook is usually already running; don't start it. (Screenshot writes may be sandboxed to the repo root — save under `local/` then `mv`.)

Pause here and let the user look. Iterate on layout/spacing only — **no component style changes yet.**

## Phase 4 — Style the component from Figma

Now change the component's `.config.ts` / `.module.css`. Get **exact tokens from Figma** — never eyeball hex from a screenshot.

### Figma desktop MCP is required for tokens

`get_screenshot` works by `nodeId`, but `get_variable_defs`, `get_design_context`, and `get_metadata` read the **current selection in the Figma desktop app** via the **Dev Mode MCP server**. If they error with "nothing selected" or the server isn't connected, **prompt the user** to enable the Dev Mode MCP server (Switch to Dev Mode → MCP section in right sidebar) and select the relevant layer(s). Don't pixel-sample a screenshot as a substitute.

### Extract and map tokens

1. `get_metadata` on the spec frame for the node id + name of each variant/size/state symbol.
2. `get_variable_defs` per symbol for exact colors, spacing, radius, font.
3. `get_design_context` (forceCode) on one symbol for exact CSS dimensions (padding, gap, icon size). It may ask about Code Connect — skip that.
4. **Use the semantic token names `get_variable_defs` returns.** An up-to-date spec binds each property to a semantic token (a role like `text/hover`, `background/selected`); match it to the corresponding `--mb-color-*` key (key list: `frontend/src/metabase/ui/colors/types/color-keys.ts`) and use it directly — one definition then works in both themes. Sanity-check the resolved shade against `colors/constants/themes/light.ts` / `dark.ts` and `base-colors.ts`. Caveat: returned *values* may be the wrong mode for dark symbols — trust the variable **names**, not the dark hex.

### Color rules — semantic tokens only, NO `color-mix`, NO primitives

Per `docs/developers-guide/frontend.md` ("Colors"): every color must be a **semantic** `--mb-color-*` token. No literal hex, and no `color-mix` in component CSS to fake a shade/alpha.

**Guardrail:** if `get_variable_defs` returns a **primitive ramp** (e.g. `Orion-Alpha/10`, `Ocean/60` — a ramp + number, not a role) bound directly to a property, do **not** translate it to a ramp, hardcode hex, or `color-mix` your way to it. **Stop and flag it to the user** with the specific property/state — it's a design-side gap (bind to a semantic token, or add one). Resume once the spec exposes a semantic token.

### Non-color tokens — flag scale mismatches too

The same discipline applies to **dimensional** values — radius, spacing/padding/gap, elevation/shadow, and typography (font size, line-height, weight). Prefer the codebase's existing scale variable over a literal: `--mantine-radius-*`, `--mantine-spacing-*`, `--mantine-shadow-*`, and the Mantine font tokens.

But Figma's scales don't always line up with the codebase's. When a Figma value **has no matching step** in the corresponding scale — e.g. Figma `radius/md = 12px` while `--mantine-radius-md` is `8px`, or a Figma `xxxs` spacing step with no Mantine equivalent — **don't silently bake in a literal.** Flag it to the user the same way you flag primitive colors: name the property, the Figma value, and the nearest codebase token, so it can be resolved with design / the scale owners (align the value, or add a scale step). Only fall back to a literal if the user confirms it's an accepted one-off, and leave a short comment in the code explaining why.

### Mantine implementation notes (reference)

General gotchas when extending Mantine components — adapt per component:

- **Know which slot each data-attribute lands on.** Mantine puts state attributes on specific slots (e.g. `data-variant` on the root, `data-checked`/`data-disabled` on an inner slot). Scope rules accordingly, usually through a root `classNames.root` class.
- **Out-specify Mantine's built-in variant CSS.** It styles slots at `.m_*:not([data-disabled])` specificity; a descendant combinator through your root class wins. Avoid chained `:not()` (stylelint's `selector-not-notation: complex` rejects it, and combining lowers specificity) — gain specificity via the root class / attributes instead.
- **Size via a `vars` resolver**, returning only Mantine's typed vars for that component (custom var names fail type-check). Map size → vars in `.config.ts`.
- **Built-in icons use `currentColor`**, so they inherit the slot's text color.
- For text on a brand fill, follow the existing convention (`text-primary-inverse`) unless the user wants pure white; flag the dark-theme implication.

After edits: `npx stylelint <css>`, `LINT_CSS_MODULES=true bun run lint-eslint-pure -- <files>`, `bun run type-check-pure`.

## Phase 5 — Iterate with the user

Show the result in the running Storybook and address feedback (color, spacing, radius, shadow, missing/extra state). Surface deliberate deviations explicitly so the user can veto them. If a browser MCP is connected, screenshot the matrix in both themes to catch issues first. **Do not commit until the user is satisfied.**

## Phase 6 — Commit, then migrate call sites

Only after sign-off:

1. Commit when the user explicitly asks; commit only relevant files (exclude build artifacts and the gitignored `local/` doc). Follow the user's commit conventions.
2. **Update mode:** migrate the call sites flagged in Phase 2 if the restyle requires it (e.g. invalid/renamed props). Be surgical with bulk find/replace — a blanket prop rename can hit unrelated components; verify each hit is the target. **Create mode:** confirm the public export is wired through the barrels and used as the ticket intends.
3. Leave the findings doc in place for the user's manual verification pass.

---

## Checklist

- [ ] Linear issue fetched; Figma node/fileKey + `gitBranchName` extracted; on the right branch; mode (update vs create) decided.
- [ ] **Update:** usage + blast radius in `local/<TICKET>-<component>-usage-findings.md`; behavior locked with unit tests **if** the component has custom interactive logic (skip for thin Mantine wrappers / pure restyles). **Create:** component scaffolded with its public surface and barrel exports.
- [ ] Storybook showcase matrix built from the component's full state space (theme excluded — global toggle drives light/dark), single panel, hover/pressed forced via `storybook-addon-pseudo-states`, controls scoped per story; lint + type-check pass. (Update mode: built before styling, **component styles untouched**. Create mode: built after the component is implemented in Phase 4.)
- [ ] Figma desktop MCP available; exact tokens extracted and mapped to semantic `--mb-color-*` (NO `color-mix`, NO primitives) and to existing scale vars for radius/spacing/elevation/type — any color *or* dimensional value with no matching token/scale step flagged to the user, not baked in as a literal.
- [ ] Component styled; stylelint + eslint(+CSS modules) + type-check pass.
- [ ] Iterated with the user until satisfied.
- [ ] Committed (when asked); call sites migrated/verified (update) or export wired (create); findings doc handed back.
