# dashboard-core — port findings

Source: `e2e/test/scenarios/dashboard/dashboard.cy.spec.js` (2,285 lines, 46
tests) → `tests/dashboard-core.spec.ts` (2,131 lines, 46 tests).
New helpers: `support/dashboard-core.ts` only (already in `support/INDEX.md`;
no new helpers added while stabilising, so no index regeneration needed).

Verified on slot 6 (`PW_SLOT_OFFSET=6`, per-worker source-mode backend on
:4106). The slot-6 backend had been up for many hours, so it was **killed and
re-booted fresh** before any result was trusted — the known staleness trap.

**Result: 46/46 accounted for — 45 passed, 1 skipped, 0 failed, 0 fixme.**
Clean under `--repeat-each=2`. No `test.fixme` was needed and **no product bug
is claimed**.

The 1 skip is the `LOCAL TESTING ONLY` translated-placeholder test
(metabase#15694), which carries a `@skip` tag upstream because translations
can't run in CI (metabase#15656) and whose comment says explicitly "DO NOT
unskip". It is skipped in both harnesses for the same stated reason.

## The one real finding: anchor `saveDashboard()` on the change it saves

**New gotcha — added to PORTING.md.** Two tests (`metabase#29450`,
`metabase#53132`) failed on the first full-file run, each with a 30s timeout.
Both were **port defects**, and both had one root cause.

Adding a dashcard via the questions sidebar is asynchronous. Cypress's command
queue paces `.click()` and the following command far enough apart that the
card-add always lands first. Playwright fires them back-to-back, so `Save` can
be clicked **before the card-add has been applied to dashboard state**. The
dashboard is then not dirty, so Save simply exits edit mode **without issuing
the PUT**, and `saveDashboard()`'s `waitForResponse` waits 30s for a request
that is never sent.

The failure mode is nasty because it is silent and misattributed:

- Nothing errors at the real culprit — the sidebar click "succeeds".
- The exception surfaces 30s later inside a **shared** helper
  (`support/dashboard.ts:54`) that is correct and faithful to
  `H.saveDashboard`, which invites blaming the helper, the locator, or the app.
- `saveDashboard`'s own `expect(editBar).toBeVisible()` gate does not help:
  the edit bar is *already* visible, so it returns instantly and adds no settle
  time.
- The two tests fail at *different* assertions (one on the missing PUT, one on
  a native editor that never renders), which disguises the shared cause.

**Fix pattern** — anchor on the mutation landing before anything depends on the
dashboard being dirty:

```ts
await sidebar(page).getByText("Orders, Count", { exact: true }).click();
await expect(getDashboardCards(page)).toHaveCount(1); // anchor
await saveDashboard(page);
```

Generalised: **any Playwright `saveDashboard()` must be anchored on the
mutation it is meant to persist.** This is the inverse of the existing
"cy.wait after non-triggering clicks — register at the true trigger" gotcha:
there the request fires at an unexpected moment, here it is never fired at all.

### Evidence it is causal

| run | result |
| --- | --- |
| full file, before fix | 43 passed / **2 failed** / 1 skipped |
| same 2 tests, in isolation (`-g "29450"`) | **passed** (9.9s) |
| `-g "add a question"` describe, before fix | 2 failed / 5 passed, **1.7m** |
| `-g "add a question"` describe, after fix | **7 passed, 34.9s** |
| `-g "add a question"` describe, after fix, `--repeat-each=3` | **21/21 passed** |

The 1.7m → 34.9s drop is exactly the two 30s action timeouts disappearing. The
`--repeat-each=3` pass ran while the machine was at **load average ~57**
(sibling agents running their own backends and suites) — adverse timing makes
this race *more* likely, so a clean stress run under that load is a strong
signal rather than a lucky one.

Worth flagging for future agents: **29450 passes in isolation and fails in
sequence.** That is precisely the shape that tempts an agent to write it off as
flake. It reproduced 2/2 in sequence and 0/21 after the fix — it was never
flake, it was a real race the port introduced.

## Fidelity cross-check (corroborating — with an engine caveat)

**Primary evidence that this is a port bug, not a product bug, is not the
cross-check**: a purely test-side wait makes both tests pass, deterministically
and 21/21 under stress. If adding an `expect(...)` to the test fixes it, the
app did the right thing all along and the test was wrong. That argument stands
on its own.

Note also that the PORTING.md fidelity rule's bar — "never `test.fixme` or
claim a product bug without the cross-check" — is not actually engaged here:
nothing is fixme'd and no bug is claimed. The cross-check below was used to
*rule out* a product bug before fixing the port, which is the safe direction.

Ran the **original Cypress spec against the same slot-6 backend** — never
touching :4000:

```
MB_JETTY_PORT=4106 bunx cypress run \
  --config-file e2e/support/cypress.config.js \
  --spec e2e/test/scenarios/dashboard/dashboard.cy.spec.js
```

⚠️ **Caveat — this run was Electron, not Chrome.** PORTING.md's fidelity
section (added while this spec was being verified) requires `--browser chrome`,
because a bare `cypress run` defaults to Electron and comparing Electron to
Playwright's Chromium bakes an engine mismatch into the evidence. This run
predates that rule and did not pass the flag. It should be **re-run with
`--browser chrome`** before anyone cites it as fidelity evidence. It is not
load-bearing for the conclusion here (see the paragraph above), and an engine
mismatch does not plausibly explain the result anyway — the failure was a
same-engine race that a same-engine wait fixed — but the run as performed does
not satisfy the playbook.

On the other documented hazard — that a Cypress cross-check on a **busy
multi-slot box** can 500 from H2 sample-DB lock contention, because snapshots
pin database 1 to the shared `e2e/tmp` file and Cypress (unlike our harness)
never re-points it per worker — note the **direction of my result makes it
immune**: contention manufactures *false failures*, never false passes. My
cross-check passed, and passing required real sample-DB reads (the assertions
check `Orders, Count` = `18,760`). So the box being busy cannot explain it away.

Cypress (Electron) **passes both** tests that the port was failing:

```
✓ should save a dashboard after adding a saved question from an empty state (metabase#29450)
✓ should save changes to a dashboard after using the 'Add a chart' button from an empty tab (metabase#53132)
```

Per the fidelity rule, *different result = the port drifted* → port bug, fix
the port, claim nothing. This is the **opposite outcome** to
`dashboard-filters-reproductions-1`, where Cypress failed identically and the
port was exonerated. Same cross-check, run the same way, settling two ports in
opposite directions — which is the argument for the rule itself.

Note the Cypress run cannot complete this spec in the spike harness: it hangs
retrying the `before each` hook for the snowplow describe ("should be possible
to add an iframe card") because there is no snowplow-micro container. The port
stubs those helpers, so this is a known harness gap, not a difference between
the two specs. The cross-check was killed after both tests of interest had
reported.

## Infra dividend: parallel agents share one session scratchpad *and* one worktree

Hit while verifying this spec; will recur for every concurrently-dispatched
slot agent, so it is worth a line in the playbook.

Slot agents dispatched from one orchestrator session share a scratchpad
directory **and** the repo working tree. Two agents independently redirected
run output to the obvious filename (`scratchpad/run1.log`); the second agent's
`>` truncated the file while the first agent's run still held an open handle at
a large offset, interleaving both runs into one unreadable file.

The symptom is memorable: a run log that suddenly shows **a different spec on a
different port** (`tests/metrics-explorer.spec.ts` on `:4104` appearing
mid-way through the slot-6 log), and a `✘` count that **goes down** between
polls. An agent that trusts that log will draw nonsense conclusions — a
decreasing failure count reads as flakiness, and a cross-slot result is easy to
misattribute to the spec under test.

This was **only a log collision** — the runs themselves were unaffected,
because slots own separate backends (`:4104` vs `:4106`), so PORTING.md's "one
test-runner at a time per backend" rule was never violated. Playwright's
`test-results/` output dir *is* shared, though, and a sibling's run wipes it,
so failure artifacts (`error-context.md`, traces) can vanish before you read
them.

**Fix pattern**: give run logs a slot/spec-unique name
(`scratchpad/run-<spec>-slot<N>.log`) and pass `--output` when you need
artifacts to survive. "Session-specific" is not "agent-specific".

## Scope of these claims

- Established: the two failures were port defects; the fix is the anchor above;
  the file is green and stable at `--repeat-each=2` on a freshly-booted
  source-mode backend on this branch.
- **Unverified in this spec**: behaviour under the CI jar backend + static
  assets. The race is timing-dependent, so CI (different machine, different
  asset pipeline) is the real test of the fix. Nothing here is evidence about
  any other spec's `saveDashboard` call sites — though the same unanchored
  pattern would fail the same way, and grepping other ports for
  `sidebar(...).click()` immediately followed by `saveDashboard(` is a cheap
  next step.
- Not claimed: any product bug. Both suspicious tests are regression tests for
  real past bugs (29450/53132), which made a regression a tempting story; the
  Cypress cross-check ruled it out.
</content>
