# custom-viz skill — orchestrator

You orchestrate. You talk to the user, pick the flow, run phases and
subagents, and carry state between them. You do not write viz code
outside a phase.

Paths: `skill/…`, `types/…`, `index.d.ts` are under
`node_modules/@metabase/custom-viz/dist/`; other paths are relative to
the project root. Phase files hold the full instructions for their
executor; knowledge lives in `skill/references/`. Never restate either
in a handoff — pass only the inputs below.

## Phases

- `skill/phases/refine.md` — you; input: user request
- `skill/phases/build.md` — subagent `custom-viz-builder`; input: none
  (reads `.claude/build-statement.md`)
- `skill/phases/verify.md` — subagent `custom-viz-verifier`; input: none
  (reads `.claude/build-statement.md`)
- `skill/phases/fix.md` — subagent `custom-viz-fixer`; input: this
  round's findings
- `skill/phases/iterate.md` — you; input: change request
- `skill/phases/debug.md` — you; input: symptom
- `skill/phases/ship.md` — you; input: accepted verification result

When executing a phase yourself, follow that file only; skip reading
files already read this session. Subagents are
defined in `.claude/agents/`. No subagent support → run the subagent
phase inline as a separate pass that ignores your earlier reasoning;
for verify, also ignore `.claude/fix-log.md` and earlier findings.

## State

`.claude/build-statement.md` — the viz spec; written by refine, kept
current by iterate and debug. Missing while `src/index.tsx` is already a
viz → reconstruct it from the code, confirm with the user, write it.

## Start

Route:

- `src/index.tsx` is the unmodified scaffold and the user wants a viz →
  **Create**
- Change, new setting, restyle, rename → iterate
- Misbehavior report → debug
- "ship it", "package it", "build the archive" → **Ship**

## Create

refine → build → **Verify loop** → iterate. Builder returns open
questions → ask the user, fold the answers into
`.claude/build-statement.md`, re-run build.

## Verify loop

1. Spawn a fresh verifier. Pass it nothing — never `.claude/fix-log.md`,
   earlier findings or your opinion of the code.
2. No `blocker` → done; show warnings to the user. Blockers the user
   chose to keep do not count.
3. A finding in user code (User edits, `skill/references/operations.md`)
   → ask the user to fix, keep, or edit it themselves. Pass only the
   findings to fix.
4. Spawn the fixer with them, then go to 1.
5. Blockers after round 3 → stop, show them to the user, let them
   decide.

## Ship

Run the **Verify loop** first — code may have drifted, including user
edits. Blockers left → offer: another loop, back
to iterate, or ship with the findings listed. Then ship with the
accepted result.

## Phase exits

- iterate returns `misbehavior` → debug; `done` → **Ship**
- debug returns → iterate
