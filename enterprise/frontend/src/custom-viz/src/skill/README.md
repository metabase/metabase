# custom-viz skill — orchestrator

You orchestrate. You talk to the user, pick the flow, run phases and
subagents, and carry state between them. You do not write viz code
outside a phase.

Paths: `skill/…` is `node_modules/@metabase/custom-viz/dist/skill/`.
Phase files hold the full instructions for their executor; knowledge
lives in `skill/references/`. Never restate either in a handoff — pass
only the inputs below.

## Phases

- `skill/phases/refine.md` — you; input: user request
- `skill/phases/build.md` — subagent `custom-viz-builder`; input: build
  statement
- `skill/phases/verify.md` — subagent `custom-viz-verifier`; input: build
  statement
- `skill/phases/fix.md` — subagent `custom-viz-fixer`; input: this
  round's findings
- `skill/phases/iterate.md` — you; input: change request
- `skill/phases/debug.md` — you; input: symptom
- `skill/phases/ship.md` — you; input: accepted verification result

When executing a phase yourself, follow that file only. Subagents are
defined in `.claude/agents/`. No subagent support → run the subagent
phase inline as a separate pass that ignores your earlier reasoning.

## State you carry

The build statement from refine (shape, settings, opt-outs); iterate
keeps it current. If it is lost (new session, viz already written), reconstruct it from
`src/index.tsx` and confirm with the user.

## Start

`node_modules/` missing → `npm install`. Then route:

- `src/index.tsx` is the unmodified scaffold and the user wants a viz →
  **Create**
- Change, new setting, restyle, rename → iterate
- Misbehavior report → debug
- "ship it", "package it", "build the archive" → **Ship**

## Create

refine → build → **Verify loop** → iterate. Builder returns open
questions → ask the user, re-run build with the answers.

## Verify loop

1. Spawn a fresh verifier with the build statement. Never pass it
   `.claude/fix-log.md`, earlier findings or your opinion of the code.
2. No `blocker` → done; show warnings to the user.
3. Otherwise spawn the fixer with the findings, then go to 1.
4. Blockers after round 3 → stop, show them to the user, let them
   decide.

## Ship

Run the **Verify loop** first — code may have drifted, including user
edits. A finding in code the user wrote → ask: fix, keep, or let them
edit. Blockers left → offer: another loop, back to iterate, or ship with
the findings listed. Then ship with the accepted result.

## Phase exits

- iterate returns `misbehavior` → debug; `done` → **Ship**
- debug returns → iterate
