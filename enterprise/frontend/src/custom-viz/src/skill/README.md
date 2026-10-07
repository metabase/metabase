# custom-viz skill — orchestrator

You orchestrate. You talk to the user, pick the flow, run phases and
subagents, and carry state between them. You do not write viz code
outside a phase.

Paths: `skill/…`, `types/…`, `index.d.ts` are under
`node_modules/@metabase/custom-viz/dist/`; other paths are relative to
the project root. Phase files hold the full instructions for their
executor, including their `Input:`; knowledge lives in
`skill/references/`. Never restate either in a handoff — pass only the
phase's input.

Read first: `skill/references/project.md`,
`skill/references/operations.md`.

## Phases

- `skill/phases/refine.md` — you
- `skill/phases/build.md` — subagent `custom-viz-builder`
- `skill/phases/test.md` — subagent `custom-viz-tester`
- `skill/phases/iterate.md` — you
- `skill/phases/debug.md` — you
- `skill/phases/ship.md` — you

When executing a phase yourself, follow that file only; skip reading
files whose content is still in your context. Subagents are defined in
`.claude/agents/`. No subagent support or the agent file is missing →
run the phase inline.

## References

- `project.md` — files, build statement format, defaults, checks
- `api-contract.md` — host behavior the types cannot express
- `known-mistakes.md` — bugs with symptoms, fixes, detectors
- `sandbox-restrictions.md` — what the sandbox blocks at runtime
- `sandbox-substitutes.md` — what to use instead
- `operations.md` — dev server, connecting Metabase, renaming, user edits
- `fix-log-rules.md` — format and rules of `.claude/fix-log.md`
- `testing.md` — the test API and what to test

## State

- `.claude/build-statement.md` — the build statement; written by refine,
  kept current by iterate and debug. Missing while `src/index.tsx` is
  already a viz → reconstruct it from the code in the `project.md`
  format, confirm with the user, write it.

## Start

Route:

- `src/index.tsx` is the unmodified scaffold and the user wants a viz →
  **Create**
- Change, new setting, restyle, rename → iterate
- Misbehavior report → debug
- "ship it", "package it", "build the archive" → **Ship**
- Question about the viz, the API or the setup → answer from the
  references and the code; no phase

## Create

refine → build → test → iterate. Builder returns open questions → ask
the user, fold the answers into `.claude/build-statement.md`, re-run
build. Tester reports failing tests → debug with them as the symptom,
before iterate.

`.claude/build-statement.md` changes in iterate or debug → re-run test.

## Ship

Run Checks (`project.md`). Failures → fix them first (debug). Then run
ship.

## Phase exits

- iterate returns `misbehavior` → debug; `done` → **Ship**
- debug returns → iterate
