# custom-viz skill

You are working inside a Metabase custom visualization project created by
`npx @metabase/custom-viz init`. This directory
(`node_modules/@metabase/custom-viz/dist/skill/`) ships with the SDK and is
always in sync with the installed SDK version — trust it over any memory of
older API shapes.

## Source of truth for the API

Do not write viz code from memory. Read the installed type declarations:

- `node_modules/@metabase/custom-viz/dist/index.d.ts` — package exports
- `node_modules/@metabase/custom-viz/dist/types/*.d.ts` — component props,
  series/column shapes, the settings and widget catalog, click/hover
  objects; all JSDoc-commented
- `references/api-contract.md` — host behavior the types cannot express
- `references/sandbox-restrictions.md`
  and `references/sandbox-substitutes.md` — what fails at runtime and what
  to use instead
- `references/known-mistakes.md` — bugs seen in real generated vizzes,
  each with a detector and a fix

Read reference files when the route needs them, not all up front.

## First: route the request

Determine where the project is (from disk) and what the user wants (from
their message), then follow the matching route:

| Situation                                                                                               | Route                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.tsx` is still the scaffolded thumbs-up/down template and the user asks to build something    | Creation cycle: `phases/refine.md` → `phases/build.md` → verify ⇄ fix loop (`phases/verify.md`, `phases/fix.md`) → `phases/iterate.md`                                      |
| The viz is written and the user reports misbehavior ("tooltip doesn't hide", "the chart keeps growing") | Debug: run the verification pipeline below, match the symptom against `references/known-mistakes.md` (entries are symptom → cause → fix), apply a targeted edit, hot-reload |
| The user asks for a change, a new setting, a restyle                                                    | `phases/iterate.md`                                                                                                                                                         |
| "ship it" / "build the archive" / "package it"                                                          | `phases/ship.md` (includes the mandatory final verification)                                                                                                                |

Disk signals to check: `node_modules/` present (if not, `npm install`
first); `src/index.tsx` customized or template; a process on port 5174; a
`*.tgz` in the project root.

## The three-level verification pipeline

Used after Build, during Debug, and before Ship. Levels 1–2 are
mechanical — run them yourself and treat every error they report as fact:

1. `npm run type-check`
2. `node node_modules/@metabase/custom-viz/dist/skill/verify-tokens.mjs src/index.tsx`
   — type-aware scan (TypeScript compiler API) of `src/index.tsx` and its
   local imports for sandbox-blocked APIs. Blocked tags and global event
   types come from the sandbox source at the same version as the SDK; the
   DOM API list (`blocked-apis.mjs`) is maintained by hand. A clean run
   does not prove the viz is sandbox-safe: values typed `any`, computed
   property names and code inside dependencies are not checked
3. The **verifier** (`phases/verify.md`) — judgment-only checks that code
   cannot make. Pass it the level 1–2 results as established facts.

## Roles and process rules (non-negotiable)

- **You (the main agent)** are the router and conductor: user dialog,
  routing, iteration and debug edits, final packaging. Only you start the
  dev server — a subagent's background processes die with it.
- **builder / verifier / fixer** subagents are declared in
  `.claude/agents/`; each reads its phase file from this directory.
- **The verifier always starts fresh** — no memory of previous rounds, no
  access to `.claude/fix-log.md`, no prior findings history.
- **The fixer remembers** through `.claude/fix-log.md` (symptom → cause →
  what changed and why). It reads the log before editing and may revert a
  logged fix only by explicitly explaining why the earlier diagnosis was
  wrong.
- **At most 3 verify ⇄ fix rounds.** If blockers remain after round 3,
  stop and escalate to the user honestly.
- If the agent host cannot spawn subagents, run the same phase files
  inline, in order, keeping verification as its own self-contained pass.
- The LLM writes exactly one code file: `src/index.tsx` (plus
  `public/assets/icon.svg` when asked). Never edit `package.json`,
  `vite.config.ts`, `tsconfig.json`, or `metabase-plugin.json` (rename
  procedure below is the one exception) — the scaffold owns them.
- Drill-through (`onClick`), hover tooltips (`onHover`), and light/dark
  theme support are **on by default**; drop one only on an explicit user
  request.
- Never silently revert edits the user made themselves — show the
  difference and ask.
- If a Metabase MCP server is connected, read the data shape from a live
  saved question instead of asking the user to describe it in words.

## Renaming the viz

The id must match everywhere; change all of these together: `"name"` in
`metabase-plugin.json`, the `id` passed to `defineConfig` in
`src/index.tsx`, and the project directory name (plus `"name"` in
`package.json` for tidiness). Restart the dev server afterwards.
