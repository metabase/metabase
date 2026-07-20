# sharing-reproductions

Port of `e2e/test/scenarios/sharing/sharing-reproductions.cy.spec.js` (1249
lines, 17 describes, 20 tests) → `tests/sharing-reproductions.spec.ts` +
`support/sharing-reproductions.ts`. No shared support module was edited.

## Summary (3 lines)

20/20 tests executed and green on the local CI jar (2×20 under
`--repeat-each=2`), zero fixmes, `tsc --noEmit` clean. The maildev gate is real
and measured: gate-on 20/0, gate-off control 12 passed / 8 skipped — and two
describes upstream put behind `H.setupSMTP` were moved to
`configureSmtpSettings`, converting them from would-be gate-skips into
unconditional coverage. Mutation testing ran 13 mutants/probes: 12 killed
(6 aimed specifically at tail assertions, all killed there), 1 probe survived
and exposed a **vacuous assertion that is vacuous upstream too**, now anchored.

## Brief correction: this spec has no QA-database dependency

The brief filed this under the QA-DATABASE tier. It isn't one. Every fixture in
the file is on the H2 **sample** database; the `@external` tag on 8 of the
describes means the **maildev** container, not an external DB. Nothing here
reads or writes `writable_db`, so the shared-container contamination class
(FINDINGS #85) does not apply and there is no `relfilenode`-style container
evidence to give — I am recording that as "not applicable", not as "verified".
Runs still carried `PW_QA_DB_ENABLED=1`; no `test.skip` in the file consults it,
so it changes nothing.

The gate that does matter here is maildev, which was confirmed as **2.0.5**
before the first run (`curl :1080/email` → 200, `:1080/api/email` → 404), per
the #67 pin.

## Executed vs gate-skipped

| run | passed | skipped |
| --- | --- | --- |
| gate ON (maildev up) | 20 | 0 |
| gate ON, `--repeat-each=2` | 40 | 0 |
| **gate OFF control** (forced `maildevAvailable = false`) | 12 | 8 |

The 8 gate-off skips are exactly the send-mail tests: 18009, 18344, 18352,
18669, 21559, 24223, and both 49525 tests. **Email tests reported separately:
8/8 executed, 0 skipped.**

## `setupSMTP` → `configureSmtpSettings` on two describes (coverage recovered)

Upstream calls `H.setupSMTP()` in 30314 and 17658, but neither test ever sends
mail — 30314 only checks the new-subscription form resets on Cancel, 17658 only
deletes a subscription. They need email *configured*, not *deliverable*. Both
ported onto `configureSmtpSettings` (bulk `PUT /api/setting`, no live SMTP
validation), so they run with or without the container: 2 tests that would have
been maildev-gated are now unconditional.

## FINDING: upstream's 54603 archival assertion is VACUOUS (in Cypress too)

`issue 54603 › warns before removing a filter that has active subscriptions`
ends with:

```js
H.openDashboardMenu("Subscriptions");
H.sidebar().findByText("Weekly Category Roundup").should("not.exist");
```

with the comment "Saving triggers server-side archival of any subscription
referencing the removed parameter … so the panel reflects the archive without a
refresh."

A presence probe (assert the *same* locator matches BEFORE the removal) **did
not fail**. Measured directly on the unmutated test, at that exact point:

- `sidebar().innerText()` → `"Subscriptions"` — nothing else.
- `GET /api/pulse` → the subscription is still there
  (`name: "Weekly Category Roundup"`, `parameters: [{id: "54603-cat", …}]`).

So the subscription is never rendered in that panel at all — this describe
configures neither email nor Slack, and the pulse's only channel is Slack. The
assertion therefore passes whether or not the archival happened. The semantics
are identical in Cypress, so **this is vacuous upstream, not port drift**.

The rest of that test is sound — the modal-warning half was killed by a mutant
(see below). Only the archival tail was hollow.

**Fix applied (added, nothing dropped):** the port keeps upstream's sidebar
assertion verbatim and anchors it on the server state it is actually about —
`GET /api/pulse` no longer lists the subscription. Discriminating control
measured on the real flow: `GET /api/pulse` returns the subscription before the
save and `[]` after it.

## GOTCHA (new, generalisable): Cypress treats `opacity: 0` as HIDDEN; Playwright does not

`should("not.be.visible")` in issue 21559 targets the dashboard header's
"Edited a few seconds ago by you" button. That label is never removed from the
DOM — it is faded out by `opacity: 0`
(`DashboardHeaderView.module.css .HeaderLastEditInfoLabel`, flipped by a 4s
`showSubHeader` timer at `DashboardHeaderView.tsx:94-101`). Cypress's
visibility algorithm counts an `opacity: 0` element as hidden, so upstream
passes. Playwright's `toBeVisible()` checks only a non-empty box plus
`visibility`, so `not.toBeVisible()` can **never** pass; it burns the whole
timeout on an element that resolves fine (observed: 24 resolutions, all
"visible").

Same family as the documented scroll-clipping rule ("`should('not.be.visible')`
on a scrolled-away element ≠ `not.toBeVisible()` → `not.toBeInViewport()`), but
a **different mechanism** needing a different port: assert the computed opacity.

Two wrinkles worth carrying:
- The rule is `:hover`/`:focus-within`-gated — hovering the header pins opacity
  back to 1. Playwright leaves the real cursor wherever the last click landed
  (here the just-clicked Save button), so the mouse must be parked first.
  Cypress's synthetic clicks never moved the OS cursor, so upstream never saw
  this.
- It is also container-query gated (`@container dashboard-header
  (max-width: 40rem)` forces opacity 1). At the harness's 1280px viewport the
  query does not apply, but a narrower viewport would make the assertion
  unsatisfiable regardless of the timer.

**Sweep candidate**: any landed port of a `should("not.be.visible")` where the
app hides by fading. Fingerprint is a timeout on a plainly-present element.

## GOTCHA: never anchor a multi-step interaction on a PLACEHOLDER

Two of the three run-1 failures were the same shape in different widgets:

- `cy.findByPlaceholderText("Enter user names or email addresses")…type(x{enter}).blur()`
  — the token field drops its placeholder once the first recipient pill is
  committed, so the trailing `.blur()` had nothing to resolve.
- `cy.findByPlaceholderText("Text").clear().type("Rye{enter}")` on a public
  dashboard — the parameter widget drops its placeholder **on focus**, so the
  `click()` succeeded and the very next `fill()` timed out. That reads as "the
  public dashboard didn't load"; it had loaded fine.

Cypress chains every command on the **already-resolved subject**, so a selector
that stops applying mid-chain costs it nothing; Playwright re-resolves per call.
Adjacent to the documented "list re-renders under a resolved locator" rule but
the inverse failure: the element is fine, the *selector* stopped applying.
Placeholders are the attribute most likely to disappear as a side effect of the
very interaction under test. Re-anchor on something stable
(`getByTestId("token-field") input`, `filterWidget().getByRole("textbox")`).

## Mutation testing — 13 mutants/probes, 12 killed

Inputs inverted, not expectations, except where marked PROBE.

| # | target | mutation | result |
| --- | --- | --- | --- |
| 1 | 18352 | native query `'bar'` → `'qux'` (2nd literal only) | killed at the **tail** (`toContain("bar")`); `foo` still passed |
| 2 | 49525 CSV | pivot `column_split` rows/columns swapped | killed at the **deepest** assertion — header read `Category,2025,…` |
| 3 | 49525 inline | `table.column_formatting` value `10` → `1000` | killed at the **final** assertion (200 cell no longer green) |
| 4 | 24223 | drop the Category-widget clear click | killed at the pulse-card tail ("Category: Doohickey and 1 more filter") |
| 4b | 24223 PROBE | flip the two email-header negatives to positives | killed at line 597; **lines 595/596 passed** ⇒ `table.header` really resolves, contains Title/Awesome, genuinely excludes Category ⇒ negatives are discriminating |
| 5 | 22524 | `where city = {{city}}` → `where state = {{city}}` | killed at the only assertion |
| 6 | 25473 ×2 | `string/ends-with` → `string/starts-with` | both killed at the **final** assertion (`cameron.nitzsche` count) |
| 7 | 30314 | remove the Cancel + reopen | killed at the first tail absence |
| 7b | 30314 | re-check "Attach results" after reopening | killed at the "Questions to attach" absence |
| 8 | 54603 t1 | pulse `parameters: [FILTER_PARAMETER]` → `[]` | killed at the warning-modal assertion |
| 8b | 54603 t1 PROBE | assert the subscription IS listed pre-removal | **SURVIVED** → the vacuity finding above |
| 9 | 21559 PROBE | flip `not.toContain("80.52")` on the email body | killed; `toContain("img")` still passed and the body is a real `<!doctype html>` ⇒ discriminating |
| 10 | 26988 | final font pick "Slabo 27px" → "Merriweather" | killed at the **last** font assertion; the first two passed |
| 11 | 16108 | hover the download icon instead of the share button | killed at the **"Share" tooltip**; the "Download results" tooltip passed |

Honest gaps: 30314's `.xlsx` / `.csv` absence lines are never *reached* by
either 30314 mutant (both die one assertion earlier, on the sibling "Questions
to attach" check in the same conditional block), so they remain unproven by
mutation. Tests 18009, 18344, 18669, 20393, 17657, 17658, 17547 and 54603 test 2
were not mutated.

## Fixmes

None.

## Environment / verification

- Jar: `target/uberjar/metabase.jar`, `COMMIT-ID 751c2a98` (2026-07-18), slot
  4101, `PW_PER_WORKER_BACKEND=1 PW_SLOT_OFFSET=1 --workers=1`.
- `bunx tsc --noEmit` clean.
- **No Cypress cross-check was run** — sibling slots were live, and
  `H.restore()` would have re-pointed database 1 at the shared `e2e/tmp` H2
  file and broken them. Nothing in this port needed one: no fixme, and the one
  behavioural claim (54603 vacuity) rests on direct measurement of the app's
  own DOM and API, which is stronger than a fidelity check.
