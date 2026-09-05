# dashboard-core — port findings

Source: `e2e/test/scenarios/dashboard/dashboard.cy.spec.js` (2,285 lines, 46
tests) → `tests/dashboard-core.spec.ts` (2,131 lines, 46 tests).
New helpers: `support/dashboard-core.ts` only (already in `support/INDEX.md`;
no new helpers added while stabilising, so no index regeneration needed).

Verified on slot 6 (`PW_SLOT_OFFSET=6`, per-worker source-mode backend on
:4106). The slot-6 backend had been up for many hours, so it was **killed and
re-booted fresh** before any result was trusted — the known staleness trap.

**Result: 46/46 accounted for — 45 passed, 1 skipped, 0 failed, 0 fixme** on a
full-file run (confirmed twice: once before the fix with the 2 failures, once
after with all 45 green). No `test.fixme` was needed and **no product bug is
claimed**.

⚠️ **Not clean under `--repeat-each=2`** — full-file repeat run: **89 passed /
1 failed / 2 skipped (13.1m)**. The repeat leg surfaced one flaky test,
`auto-scrolling to a dashcard via a url hash param` (:1318), measured at
**3 failed / 2 passed over 5 runs on a quiet box**. It is unrelated to the fix
below (different test, different mechanism, green before my change) and it is
left deliberately unmodified — see the open item, which includes the app-side
cause. **This spec should not be called fully stable until that is decided.**

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

## Open: `auto-scrolling to a dashcard via a url hash param` is flaky under load

Found by the `--repeat-each=2` full-file run — **exactly the failure the repeat
leg exists to catch**, and a caution against treating a single green full-file
run as "done".

`tests/dashboard-core.spec.ts:1318` passed on repetition 1 (and on both earlier
full-file runs) and failed on repetition 2, on a box at load ~27-60 from
sibling agents. It is unrelated to the `saveDashboard` anchor fix — different
test, different mechanism, and it was green before my change.

**The Cypress original fails this test too, on the same backend** — and it is
the *only* test Cypress failed among those it ran (it passes 29450 and 53132).
So the same cross-check classified three tests in two directions, which is the
best possible advertisement for running it.

But **do not read that as "port faithful, behaviour real" yet** — the
"same failure at the same assertion" bar is *not* met here:

1. Cypress's error text was never captured (its failure details print in the
   end-of-run summary, and the run was killed at the snowplow hang before it
   got there). We know *that* it failed, not *where*.
2. This is the one test where **the port deliberately deviates from Cypress**.
   The Cypress original visits `` `/dashboard/${dashboard.id}}` `` — a stray
   `}` in the URL (`dashboard.cy.spec.js:1101`) — which the port drops
   (documented in the spec header). So Cypress's first visit hits a different
   URL than the port's, and its failure could be at the *first* assertion for
   reasons that have nothing to do with scrolling. The two are not
   apples-to-apples for this test.
3. Cypress's final assertion is `should("be.visible")`, which in Cypress is a
   CSS/clipping check, not a scroll-position check. The port's
   `toBeInViewport()` is a **stronger** assertion. That is arguably a test
   strengthened by the migration — but it also means a port failure here does
   not imply a Cypress failure, or vice versa.

Actual port failure (from the `--repeat-each=2` run, repetition 2):

```
Error: expect(locator).toBeInViewport() failed
Locator: getByText('Scroll to me plz.', { exact: true })
Expected: in viewport
Received: viewport ratio 0
Timeout:  10000ms
  24 × locator resolved to <p>Scroll to me plz.</p>
```

Note the element *renders* fine and stays at ratio 0 for the full 10s — so the
scroll simply never lands (or lands and is undone), rather than the element
being missing. The `expect.poll(hash).not.toContain("scrollTo")` gate *passed*
immediately before, which makes it a **weak anchor**: the app clears the hash
independently of the scroll finishing. A plausible mechanism is that the scroll
fires in `DashCard`'s mount effect and the async-loading Orders card (size_y 9)
then reflows and pushes the target back out of view — which would explain why
it only bites when the box is slow.

Suspect region:

```ts
await page.goto("about:blank");
await page.goto(`/dashboard/${dashboard.id}#scrollTo=${target?.id}`);
await expect.poll(() => new URL(page.url()).hash).not.toContain("scrollTo");
await expect(page.getByText(TARGET_TEXT, { exact: true })).toBeInViewport();
```

Also note the earlier negative assertion `.not.toBeInViewport()` immediately
after `goto` can pass **vacuously** while the page is still blank, so it is not
evidence the below-the-fold state was ever really rendered.

### Measured flake rate and the app-side mechanism

`-g "auto-scrolling" --repeat-each=5` on a **quiet** box (load ~28, after the
sibling agents drained): **3 failed / 2 passed**. So this is a ~50-60% flake,
not a load artifact of the contended box, and the three earlier single-pass
greens were luck.

The app does the scroll exactly once, on mount
(`frontend/src/metabase/dashboard/components/DashCard/DashCard.tsx:133-143`):

```ts
useMount(() => {
  if (autoScroll) {
    cardRootRef?.current?.scrollIntoView({ block: "nearest" });
    reportAutoScrolledToDashcard?.();   // clears the hash immediately
  }
});
```

`reportAutoScrolledToDashcard` (`hooks/use-auto-scroll-to-dashcard.ts:32-44`)
`replace()`s the URL to drop `scrollTo` **as soon as the scroll is requested**,
not when it has landed — and the comment says why: "to avoid repeatedly
auto-scrolling if the dashcard is unmounted then remounted". So once the hash
is gone the app will **never re-scroll**. If anything remounts or reflows the
grid after that first mount, the scroll position is simply lost.

That explains everything observed: the hash-clear poll passes (the code path ran),
the element renders fine, and it sits at viewport ratio 0 for the full 10s
because nothing scrolls again. It also explains why it worsens as the box slows.

### Why this needs a decision rather than a quick fix

- **The port's assertion is stronger than Cypress's.** Cypress ends with
  `should("be.visible")`, which ignores scroll position unless the element is
  clipped by an overflow ancestor; `toBeInViewport()` actually checks the
  scroll landed. So the port tests something the original effectively did not —
  a genuine strengthening, and plausibly a real (if minor) product raciness it
  exposes.
- Therefore the tempting "fixes": weakening to `toBeVisible` makes the test
  vacuous (it would pass without any scrolling at all), and wrapping the check
  in a retry/`toPass` is worse — it would mask exactly the behaviour under test.
- **Not claimed as a product bug.** The fidelity bar is not met: Cypress's
  failure here is at an unknown assertion, its assertion is weaker, and this is
  the one test where the port deliberately deviates from the original's URL.
  Establishing it would mean instrumenting the scroll path directly rather than
  inferring from a viewport check — per PORTING.md, "prefer instrumenting the
  actual code path over inferring".

**Recommendation for the orchestrator**: this is the single non-green item in
the spec. It is left unmodified and unskipped on purpose — it is a real signal,
and both silently weakening it and `test.fixme`-ing it without the cross-check
would launder that signal away. Deciding it properly needs either a jar-mode /
CI datapoint (is it flaky there too?) or a look at whether the mount-time
one-shot scroll is worth hardening in the app.

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
