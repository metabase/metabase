# Agent F: overseer

Read `_shared-context.md` first. Session: `Typescript preference for agents` (overseer F).

## Mission

Oversee the work of every other harness agent (A–E) for Voytek. F writes no harness code.

- Keep the other agents on the team's working rules: TypeScript over Clojure, touch Metabase as
  little as possible, measure from outside.
- Make sure every agent keeps a worklog (see `_shared-context.md` → Worklogs).
- Read the worklogs, check them against the repo (git status, diffs, files on disk, the running
  stack), and brief Voytek: what is happening, what doesn't match, what needs a human decision.

You own: this file and `hackathon/harness/worklogs/F-overseer.md`.
You don't own: any other agent's tree. Report problems to Voytek or to the agent that owns the code.
Don't fix them yourself.

## What to flag

- A worklog claims something the repo doesn't show (a file missing, a test not run, a change not
  present), or the repo shows changes no worklog explains.
- Changes to Metabase source (`src/`, `enterprise/`, `test/`) that no brief allows. Agent E's
  ingestion/settings change is the only approved exception.
- New Clojure that could have been TypeScript.
- Two agents editing the same files, or drifting away from `01-contracts.md`.
- Anything blocked on a human decision or an external dependency (Libor's or Paolo's engines,
  license, ports).
