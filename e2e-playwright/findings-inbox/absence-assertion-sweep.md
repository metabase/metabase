# Absence-assertion sweep — reverting the bad `should("not.exist")` rule

Remediation of specs written to a since-corrected PORTING.md bullet that told
porting agents to render Cypress `should("not.exist")` as a **non-retrying**
`expect(await loc.count()).toBe(0)`.

That rule was wrong. Both `should("not.exist")` and `expect(loc).toHaveCount(0)`
retry and pass at the **first absent observation** — they are equivalent, and
`toHaveCount(0)` is the faithful port. The non-retrying form samples one instant,
which is *stricter* than upstream and can go falsely red. (Measured: the
`select-embed-options` port flaked 1-in-36 on `toggles chart title for charts`
because the wizard re-renders its preview in place and the one-shot count caught
the outgoing DOM.)

**Assertion FORM only was changed. No anchor was removed, weakened, or
reordered.** Every converted assertion still sits behind the same positive
post-render gate it had before.

## Per-file table

| Spec | Converted | Kept one-shot | Notes |
|---|---:|---:|---|
| `tests/application-permissions.spec.ts` | 6 | 0 | Tracked/pushed. Reverted a stray Prettier pass to keep the diff minimal; only the 6 assertions + 4 comments changed. |
| `tests/public-sharing-embed-flow.spec.ts` | 2 | 0 | Tracked/pushed. Same minimal-diff treatment. |
| `tests/sdk-embed-setup-guest-embed-ee.spec.ts` | 9 | 0 | Includes the `publish-guest-embed-link` assertion whose "Copy code visible ⟺ link gone" mirror-state anchor is load-bearing — preserved and re-labelled `ANCHOR — do not remove`. |
| `tests/sdk-embed-setup-select-embed-options.spec.ts` | 0 | 0 | Already all `toHaveCount(0)` (this is the spec whose flake produced the correction). Header comment updated to stop citing the bad rule as authority. |
| `tests/sdk-iframe-custom-elements-api.spec.ts` | 0 | 0 | **Untouched.** Already all `toHaveCount(0)`, and its header already states the equivalence correctly. All 8 anchors (6 DOM-signal, 2 bounded-settle) intact. |
| `tests/sdk-iframe-eajs-internal-navigation.spec.ts` | 9 | 0 | Includes the reordered breadcrumb check anchored on the back button — anchor and its explanatory comment preserved. |
| `tests/sdk-iframe-embed-options.spec.ts` | 11 | 0 | Includes the `assertNoSubscriptionsButton` helper's absence (anchored on the dashboard title). |
| `tests/sdk-iframe-view-and-curate-content.spec.ts` | 6 | 0 | Added to scope mid-task. 3 × `count()` → `toHaveCount(0)`; 3 × `expect(await body.textContent()).not.toContain(...)` → `await expect(body).not.toContainText(...)` (same text source, same retry-until-absent semantics). |
| **Total** | **43** | **0** | |

### Why nothing was kept one-shot

The brief allowed keeping the non-retrying form where the point is genuinely
"X was not present at THIS instant, and X may legitimately appear later". No
assertion in scope had that shape. Every one is a steady-state absence — a
control that is off by configuration, an upsell card absent under EE, a wizard
step that has moved on, a toolbar the mode does not render.

The nearest thing to a counter-example is `guest-embed-ee` line ~307:
`Copy code` is asserted absent, and then `publishChanges()` on the *next
statement* makes it appear. Converting is still safe — the retry runs entirely
before the click that could change the state, so it resolves on its first poll.
Same for the `breadcrumbs` absence in `eajs-internal-navigation`, where the
breadcrumbs return only after a later `backButton.click()`.

### Comment cleanup

Seven header blocks and eight inline comments asserted the wrong semantics
("`should("not.exist")` is a ONE-SHOT absence check", "a retrying
`toHaveCount(0)` would be strictly stronger"). All rewritten to state the
equivalence and to point at the anchor — not the assertion form — as the thing
that makes an absence non-vacuous. `select-embed-options`' header now records
that its flake is the evidence that corrected the PORTING.md rule.

## Verification

All runs on slot 1 (port 4101), `PW_PER_WORKER_BACKEND=1`,
`PW_KEEP_SLOT_BACKENDS=1`, `PW_SLOT_OFFSET=1`, `PW_ACTION_TIMEOUT=30000`,
`--workers=1 --trace=off`, against `target/uberjar/metabase.jar`.

| Run | Result |
|---|---|
| All 8 specs, single pass | **80 passed, 1 skipped** (2.1m) — 7-spec run, before spec 8 was added |
| All 8 specs, `--repeat-each=2` | **190 passed, 2 skipped** (4.7m) |
| `bunx tsc --noEmit` | **clean** |

The 2 skips are the `@OSS`-gated `sdk-iframe-embed-options` test, which
gate-skips on the EE jar (1 skip × 2 repeats).

`sdk-iframe-view-and-curate-content` re-verified to its stated standard: all 15
tests green across both repeats.

## Mutation checks

Four attempted, four informative. Each mutation was reverted immediately after.

| # | Spec | Mutation | Result |
|---|---|---|---|
| 1 | `sdk-iframe-embed-options` | `withTitle: false` → `true` in *renders an interactive question with drills=true, withTitle=false* | **KILLED** — failed at the converted `getByText("Orders")` → `toHaveCount(0)` |
| 2 | `sdk-iframe-view-and-curate-content` | `with-new-dashboard="false"` → `"true"` | **KILLED** — failed at line 387, `Expected: 0 / Received: 1`, `24 × locator resolved to 1 element` (i.e. it retried the full window and stayed red — not a lucky single sample) |
| 3a | `application-permissions` | `modifyPermission(…, SUBSCRIPTIONS_INDEX, "No")` → `"Yes"` | **INVALID** — the mutation broke the `beforeEach` (the permission popover offers no "Yes" for that index), so the test failed in setup rather than at the assertion. Discarded, not counted. |
| 3b | `application-permissions` | assertion subject at the converted site changed to the known-present `sharingMenu(page)` | **KILLED** — failed at line 135 with `Received: 1`, confirming the site is reached and falsifiable |

No conversion turned out to be unfalsifiable.

## Things the sweep surfaced

1. **The known-vacuous assertion in `view-and-curate-content` was left vacuous,
   deliberately.** In *should pass through data-picker-entity-types parameter*,
   `not.toContain("Orders model")` cannot fail: the default snapshot ships no
   models at all. That vacuity is **upstream's**, and the port preserves it
   faithfully rather than inventing coverage. The form change does not alter it
   (the vacuity is data-driven, not timing-driven). An inline
   `KNOWN-VACUOUS UPSTREAM` comment now says so at the site, matching the note
   already in the file header.

2. **The bad rule had propagated into eight spec headers as documentation.**
   The code was fixable mechanically; the prose was the real contamination risk,
   since a future porting agent reading `sdk-iframe-embed-options.spec.ts` as a
   worked example would have copied the wrong rule forward. Worth checking any
   spec landed between the rule's introduction and its correction for the same
   header text, not just for the assertion form.

3. **Prettier is not clean on these specs.** Running `prettier --write` on the
   two tracked files produced ~50 lines of unrelated reformatting (import
   wrapping, string-argument breaking) — i.e. the ported specs were never
   Prettier-formatted, and `e2e-playwright/` is not in `.prettierignore`. That
   churn was reverted here to keep this diff reviewable, but it is a real,
   separate cleanup someone should schedule for the whole directory. New lines
   introduced by this sweep were hand-wrapped to 80 cols.

4. **`test-results/` is shared across slots.** A failure artifact from
   `sdk-embed-setup-select-embed-entity.spec.ts` (another slot's spec, not in
   this sweep) appeared in `test-results/` during a run and briefly looked like
   a flake in mine. Worth knowing when reading artifacts on a multi-slot box.

## Behaviour changes beyond the form

None. No gate, anchor, ordering, or locator was changed. In every case the
assertion covers the same state at the same point in the test, with the retry
semantics upstream actually had.
