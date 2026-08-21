# custom-elements-api (SDK-iframe, Group A) — slot 3 / :4103

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/custom-elements-api.cy.spec.ts` (712 lines)
Target: `e2e-playwright/tests/sdk-iframe-custom-elements-api.spec.ts`
New helper module: `support/sdk-iframe-custom-elements-api.ts`
`support/sdk-iframe.ts` consumed **unmodified** (verified: `git diff` on it is empty).

## Result

- **33/33 executed and passing** on the jar (`target/uberjar/metabase.jar`, COMMIT-ID `751c2a98`,
  backend `/api/session/properties` `version.hash = 751c2a9`).
- **66/66 under `--repeat-each=2`** (1.3m).
- **0 skipped, 0 gate-skipped, 0 `fixme`.** Every test in the file runs; nothing is
  gated on a container, a QA DB, or a token that isn't present.
- `bunx tsc --noEmit` clean.
- No `test.fixme`, no product-bug claims.

Slot proof (#39 discipline): a throwaway probe ran the harness's two-leg guard —
iframe `src` origin + iframe `document.location` on `http://localhost:4103`, and a
slot-unique `application-name` marker (`slot-4103-1784510859115`) written to this
slot's app DB and read back **from inside the embed iframe's own document** via
`fetch("/api/session/properties")`. Both legs passed. Scope caveat: `:4000` was not
running during this session (`curl :4000/api/health` → nothing listening), so a
misdirection would also have failed loudly here; the guard is what makes the result
trustworthy on a box where `:4000` *is* up. Probe deleted.

## THE FINDING: every absence assertion in this spec is vacuous upstream (8 of them)

This is the one thing worth carrying forward from this port.

The suite's negative assertions all have the shape

```js
H.getSimpleEmbedIframeContent().findByText(X).should("not.exist");
```

`H.getSimpleEmbedIframeContent()` blocks on `iframe[data-metabase-embed]` and
`iframe[data-iframe-loaded]` before yielding the body, so it *looks* like the
absence check runs against a rendered embed. It does not: **`data-iframe-loaded`
is set well before the embed paints its body.** Measured on this backend, the
embed iframe reports loaded at +41ms while the metabot chat surface appears at
+92ms, and a dashboard drill popover opens ~243ms after the click that triggers it.
`should("not.exist")` passes at the first observation where the element is absent —
which is the mount-lag window — so the assertion is satisfied by *nothing having
rendered yet*, regardless of what the app does.

**Verified by mutation, not by argument.** I flipped each attribute/setting to its
opposite (`with-title="false"` → `"true"`, `with-downloads="false"` → `"true"`,
`is-save-enabled="false"` → `"true"`, `drills="false"` → `drills`,
`embedded-metabot-enabled?` false → true) and re-ran the corresponding test.
**All 8 stayed GREEN** with the behaviour under test inverted. They are not
assertions; they are smoke coverage that the page didn't crash.

The affected tests:

| test | vacuous because |
| --- | --- |
| `<metabase-dashboard>` hide title when `with-title` is false | title not painted yet |
| `<metabase-dashboard>` hide download when `with-downloads` is false | ditto |
| `<metabase-question>` hide title when `with-title` is false | ditto |
| `<metabase-question>` hide download when `with-downloads` is false | ditto |
| `<metabase-question>` `is-save-enabled="false"` | save toolbar mounts after the notebook |
| `<metabase-dashboard>` `drills="false"` | check fires ~243ms before a popover could open |
| `<metabase-question>` `drills="false"` | ditto |
| `<metabase-metabot>` `embedded-metabot-enabled?` false | component hadn't rendered at all |

### What the port does about it

All 8 now carry an anchor, called out inline, and **each was re-mutated afterwards
to confirm it fails for the right reason**. 8/8 now red under mutation.

- Six anchor on rendered content that is *present in both* the positive and negative
  variants: `getByText("User ID")` for the dashboard tests, `getByTestId("table-root")`
  for the question tests, `sdkErrorContainer` → "Metabot is not enabled for embedded
  analytics." for the metabot test (a real discriminating signal I found by dumping
  the disabled component's DOM — worth knowing, it isn't documented anywhere).
- The `is-save-enabled="false"` case needed a second pass. `question-id="new"` opens
  the *notebook*, so there is no table to anchor on, and a bare
  `getByTestId("data-step-cell")` visibility check is **not** an anchor: the empty
  data step is already mounted, so it resolves in ~3ms and the check still fired
  before the save toolbar. Anchoring on the step *naming* Orders
  (`toContainText("Orders")`, +39ms) works — Save is in the DOM by then (measured).
  **Generalisable trap: a locator that exists in a pre-interaction placeholder form
  is not a gate for the interaction.**
- The two `drills="false"` cases have **no DOM signal for "the click was ignored"**,
  so they use a bounded negative: a 3s settle against a measured 243ms enabled-case
  latency (>12× margin). Sleeps are normally banned, but for a negative with no
  observable counterpart a bounded wait is the only honest option, and it converts
  two permanently-green tests into two that actually fail when drills are on.

### Rule proposed for PORTING.md

> **A `should("not.exist")` gated on a "loaded" flag is usually still vacuous.**
> Framework-level readiness signals (`data-iframe-loaded`, "spinner gone", a
> route-change) fire before content paints, so an absence check taken right after
> one is satisfied by the mount-lag window. Porting it faithfully preserves a test
> that cannot fail. **Mutation-check every negative assertion you port** — invert
> the attribute/setting under test and confirm the test goes red. If it stays green,
> find an anchor that is present in *both* variants, and prefer one whose *value*
> (not mere presence) proves the interaction landed.

## Smaller notes

- **`should("not.exist")` → `toHaveCount(0)` is the faithful port, not a
  strengthening.** Both pass at the first observation where the element is absent
  and neither re-checks. The one-shot `expect(await loc.count()).toBe(0)` form
  recommended in PORTING's batch-8–11 section is actually *stricter* — it fails on
  a transiently-present element where Cypress would pass — so it is the wrong tool
  when the goal is fidelity. (Neither form fixes the vacuity above; only an anchor
  does.) Suggest correcting that bullet.
- **`H.getSimpleEmbedIframeContent()` is not a bare `FrameLocator`.** It carries the
  iframe-loaded gate. `support/sdk-iframe.ts` splits these into
  `getSimpleEmbedIframe` (lazy) + `waitForSimpleEmbedIframesToLoad`, so a port that
  reaches only for the former silently drops the gate. `loadedEmbedFrame` in
  `support/sdk-iframe-custom-elements-api.ts` recombines them; it is a candidate to
  move into the shared module at consolidation, since every Group A spec needs it.
  (Not done here — the brief forbids editing shared modules.)
- `cy.paste()` is a custom command (`e2e/support/commands/ui/paste.ts`), not
  `fill()` — it sets the value through the native input setter, dispatches `change`,
  *and* dispatches a real `paste` ClipboardEvent. The metabot scrolling test
  (metabase#67399) is specifically about the paste path, so `fill()` would not port
  it. Ported as `pasteText`.
- `implicit existence assertion` rule applied once: upstream's
  `cy.findByRole("dialog").within(...)` around the `target-collection` save modal
  asserts the dialog exists; the port adds `expect(dialog).toBeVisible()` before the
  `not.exist` inside it.
- `findAllByText("AI isn't perfect…").should("be.visible")` is an ANY-of-set
  assertion (rule 3) → `.filter({ visible: true }).first()`, ×2.
- The three `prepareSdkIframeEmbedTest` intercept aliases (`@getCardQuery`,
  `@getDashCardQuery`, `@getDashboard`) are not registered by the ported prepare fn;
  the three tests that actually await them arm their own `waitForResponse` before
  the triggering visit (rule 2). `@getDashboard` is never awaited by this spec.
- The metabot save test's `cy.intercept("POST", "http://localhost:4000/api/card")` is
  one of the literal `:4000`s the slot model forces out; ported as an origin-checked
  predicate against `mb.baseUrl`.
- `ORDERS_COUNT_QUESTION_ID` had to be re-derived **again** (this is now the ~8th
  copy: card-embed-node, collections-reproductions, dashboard-card-fetching,
  dashcard-replace-question, dashboard-tabs, performance-caching, organization,
  question-management, supporting-text, search-filters…). It belongs in
  `support/sample-data.ts` next to `ORDERS_QUESTION_ID`. Consolidation candidate,
  strongly.

## Not verified

- No Cypress cross-check was run. Nothing here needed one: there is no failure to
  attribute, and the cross-check establishes fidelity only. The mutation checks are
  the evidence that the assertions bite.
- The vacuity finding is about **this spec's assertions**, not about the app. All
  eight behaviours (hide title, hide downloads, disable drills, disable save,
  disable metabot) are **correct** — the anchored versions pass, and only fail when
  I invert the input. No product-bug claim.
- The 3s settle in the two `drills="false"` tests is calibrated against *this*
  backend on *this* box. On a heavily contended CI shard a drill popover could in
  principle exceed 3s and the test would then be vacuous again (it would not go
  falsely red — the failure mode is silence). Flag if CI timings drift.
