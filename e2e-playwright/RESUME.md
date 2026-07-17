# Resume here

Written 2026-07-17 when the session ran out of model usage mid-wave. This is
the "you've been away" doc: current state, what's half-done, what to do first.
Read this, then PORTING.md (the playbook — rules, gotchas, environment facts).

## Where the work lives

- Branch `playwright-e2e-spike`, PR #77999. Spike package: `e2e-playwright/`.
- **Never** run `playwright`/`tsc` from the repo root — it scans the monorepo
  and OOMs node. Always `cd e2e-playwright` first.
- Local HEAD is ahead of `origin`. Everything below the "in flight" heading was
  uncommitted when the session ended; see the commit that added this file.

## Ground truth files

| File | What it is |
|---|---|
| `PORTING.md` | The playbook. Port rules, gotchas, env facts, dispatch process. Every gotcha we hit gets appended here — that loop is why later waves need fewer fixes. |
| `QUEUE.md` | Generated dispatch queue, largest specs first. 354 specs / ~192.5K lines remaining at last generation. Regenerate: `node scripts/build-queue.mjs`. |
| `PORTED.txt` | Ledger of source specs already ported. Feeds QUEUE generation. **Currently optimistic — see caveat below.** |
| `support/INDEX.md` | Generated helper catalog so agents don't re-grep. Regenerate: `node scripts/build-helper-index.mjs`. |
| `FINDINGS.md` | The case file — every migration dividend (product bugs, test-suite defects, infra discoveries). This is the artifact that makes the argument to colleagues. |
| `findings-inbox/` | Per-agent dividend drops, merged into FINDINGS.md at checkpoints. **Empty right now** — the agents died before writing their entries. |

### PORTED.txt caveat — fix this first

Lines under `# wave 9 in flight:` were added optimistically. Any spec there whose
port did not actually land must be removed, or QUEUE.md will skip real work.
Verify each against `tests/` and a green run before trusting it.

## In flight when usage ran out

Nine large specs were being ported concurrently, one agent per backend slot.
All agents died on a Fable 5 usage limit (see "Usage" below). The spec files are
**written but mostly unverified** — treat every one as WIP until it runs green.

| Slot | Spec file (lines) | State when the agent died |
|---|---|---|
| 1 | `tests/click-behavior.spec.ts` (2786) | Verification run in progress; result never seen. |
| 2 | `tests/dashboard-reproductions.spec.ts` (2438) | First chunk running; unverified. |
| 3 | `tests/dashboard-parameters.spec.ts` (2989) | **Mid-investigation of a suspected product bug** — see below. |
| 4 | `tests/metrics-explorer.spec.ts` (2560) | Partially verified; was re-running "Entry points" after a fresh backend rendered correctly. |
| 5 | `tests/dashboard-filters-reproductions-1.spec.ts` (2745) | Unverified. |
| 6 | `tests/dashboard-core.spec.ts` (2124) | **Closest to done** — "all chunks green", full-file run pending. Start here. |
| 7 | `tests/documents-comments.spec.ts` (2009) | Typechecks; never run. |
| 8 | `tests/interactive-embedding.spec.ts` (2624) | **Spec was mid-write — likely incomplete.** Check it parses before running. |
| 9 | `tests/documents.spec.ts` (2241) | Written; never run, never typechecked. |

Their new helper modules are equally unverified: `support/click-behavior.ts`,
`dashboard-core.ts`, `dashboard-parameters.ts`, `dashboard-repros.ts`,
`documents-core.ts`, `documents.ts`, `filters-repros.ts`,
`interactive-embedding.ts`, `metrics-explorer.ts`.

### Debris to delete

`repro1.png`, `scratch-repro2.ts`, `tests/zz-scratch-fixme.spec.ts` — agent
scratch files, not part of the port.

## Two open threads worth picking up

**1. `native-subquery` autocomplete — SOLVED, and it retracted a finding.**
The wave-8 CI failure (run 29569211972, 373/374 both legs) turned out to be a
**port bug, not an app bug**: loading a card whose `{{#id}}` tag is unslugged
triggers `updateTemplateTagNames` to rewrite the query text, which leaves the
saved question *dirty*, so the QB runs it through `/api/dataset` and the
`POST /api/card/:id/query` that `visitQuestion` waits for never fires. The
Cypress original used a bare `cy.visit` with no wait, so only the port was
exposed. Fixed with `visitQuestionEitherEndpoint` (`support/native-extras.ts`);
verified 4/4 × 3 runs in jar mode.

**The same investigation retracted FINDINGS #24** — neither sub-claim
reproduces against the CI uberjar, and the previously-fixme'd test now passes
and is re-enabled. See the retraction note in FINDINGS.md and the evidence in
`findings-inbox/native-subquery-ci-failure.md`. **Open action**: re-verify
#2/#22 (the dimension-tag `parameters: []` regression) against the jar the same
way — they rest on the same kind of observation and also involve cards that
return `parameters: []`. Until then the "load-path cluster" framing is
unsupported and shouldn't go in front of colleagues.

**2. `dashboard-parameters` suspected product bug (unverified).**
The agent observed `query_metadata` containing field 61 while the parameter's
value options came back empty, and was about to cross-check against the
original Cypress spec when it died. Either a real bug or a port artifact —
the Cypress cross-check is the deciding step, and it was never run.

Also unfinished: the w2-only SCIM test failure (`admin-authentication.spec.ts`
"setup and manage scim feature", died in 20ms, passed on w1) looked like
teardown noise. Watch whether it recurs.

## Usage — read before dispatching agents

The session died because **Fable 5 hit its usage limit** and every in-flight
agent inherited that model. Nine agents died mid-work, several minutes-to-hours
of work each, and none wrote its findings-inbox entry. When dispatching, pass
an explicit model to the Agent tool rather than inheriting, and prefer starting
a wave only when there's headroom to finish it.

## Suggested first moves

1. Delete the debris files listed above.
2. Finish slot 6 (`dashboard-core`) — one full-file run from green chunks.
3. Reconcile `PORTED.txt` against reality; regenerate QUEUE.md.
4. Take the two open threads above (jar-mode repro for native-subquery; Cypress
   cross-check for dashboard-parameters) — both are candidate dividends and
   both are one concrete step from an answer.
5. Then resume the dispatch loop from QUEUE.md as described in PORTING.md.

## How to verify a spec (the loop every agent runs)

```bash
cd /Users/fraser/Documents/code/metabase/e2e-playwright
PW_PER_WORKER_BACKEND=1 PW_KEEP_SLOT_BACKENDS=1 PW_SLOT_OFFSET=<slot> \
  PW_ACTION_TIMEOUT=30000 bunx playwright test <spec> --trace=off
```

Slot N owns port 410N. Kill that port first if a kept backend mass-fails.
One runner at a time per backend; never touch port 4000 (the shared dev
backend). Confirm stability with `--repeat-each=2` before landing. Run
verification in the **foreground** — a backgrounded run leaves an agent waiting
on a notification it never receives, and the slot stalls silently.

## Local services the ports assume

Docker: `postgres-sample`, `mongo-sample`, `mysql-sample`, `maildev`
(:1025 SMTP / :1080 UI), `webhook-tester`. Compose file:
`e2e/test/scenarios/docker-compose.yml`. Premium tokens come from repo-root
`cypress.env.json` (the values in `.env` are stale — never print token values).
