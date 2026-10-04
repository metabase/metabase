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
- `skill/phases/verify.md` — subagent `custom-viz-verifier`
- `skill/phases/fix.md` — subagent `custom-viz-fixer`
- `skill/phases/iterate.md` — you
- `skill/phases/debug.md` — you
- `skill/phases/ship.md` — you

When executing a phase yourself, follow that file only; skip reading
files whose content is still in your context. Subagents are defined in
`.claude/agents/`. No subagent support, the agent file is missing, or
the subagent reports its tools blocked by `agent-guard` failing to run →
run the phase inline as a separate pass that ignores your earlier
reasoning. Inline verify cannot be truly fresh: run at most one round,
tell the user, and never consult `.claude/fix-log.md`,
`.claude/accepted-findings.md` or earlier findings.

## References

- `project.md` — files, build statement format, defaults, checks
- `api-contract.md` — host behavior the types cannot express
- `known-mistakes.md` — bugs with symptoms, fixes, detectors
- `sandbox-restrictions.md` — what the sandbox blocks at runtime
- `sandbox-substitutes.md` — what to use instead
- `operations.md` — dev server, connecting Metabase, renaming, user edits
- `fix-log-rules.md` — format and rules of `.claude/fix-log.md`

## State

- `.claude/build-statement.md` — the build statement; written by refine,
  kept current by iterate and debug. Missing while `src/index.tsx` is
  already a viz → reconstruct it from the code in the `project.md`
  format, confirm with the user, write it.
- `.claude/accepted-findings.md` — yours only; never pass it to a
  subagent. One line per finding the user chose to keep:
  `<severity> — <function, component or element> — <one sentence>`.
  Create if missing.

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

refine → build → **Verify loop** → iterate. Builder returns open
questions → ask the user, fold the answers into
`.claude/build-statement.md`, re-run build.

## Verify loop

1. Spawn a fresh verifier with the prompt "Run your phase." and nothing
   else — never `.claude/fix-log.md`, earlier findings or your opinion
   of the code.
2. Drop findings that name the same code and problem as a line in
   `.claude/accepted-findings.md`, whatever the wording. Remove lines
   whose code no longer exists in `src/index.tsx`. No `blocker` left →
   done; show warnings to the user.
3. A finding in user code (`operations.md`, User edits) → ask the user
   to fix, keep, or edit it themselves. Kept → append it to
   `.claude/accepted-findings.md`.
4. Spawn the fixer with every remaining finding, blockers and warnings;
   it decides which warnings to apply. Then go to 1.
5. Blockers after round 3 → stop, show them to the user, let them
   decide; kept ones go to `.claude/accepted-findings.md`.

## Ship

Run the **Verify loop** first — code may have drifted, including user
edits. The dev server stays up during the loop, so tell the user fixes
will hot-reload in Metabase. Blockers left → offer: another loop, back
to iterate, or ship with the findings listed. Then run ship with the
accepted result and `.claude/accepted-findings.md`.

## Phase exits

- iterate returns `misbehavior` → debug; `done` → **Ship**
- debug returns → iterate
