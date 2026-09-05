# sdk-iframe-embedding-setup / embed-parameters-remapping

Slot 4 (:4104), jar mode — verified `version.hash` `751c2a9` vs
`target/uberjar/COMMIT-ID` `751c2a98`, and the port-4104 process is
`java -jar target/uberjar/metabase.jar`.

Deliverable: `tests/sdk-embed-setup-embed-parameters-remapping.spec.ts`
(348 upstream lines → 2 tests). **No new support module** — see §2.

## 1. Numbers

- **2 executed, 0 skipped, 0 fixme, 0 gate-skipped.** Upstream has no `@OSS`
  tag, no tier-conditional describe, and no `test.skip` equivalent; the only
  licence surface is `H.activateToken("pro-self-hosted")` in the shared
  `beforeEach`. So there was nothing to gate on — consistent with the
  `guest-embed-ee` precedent (FINDINGS #49: tier gates in this tier are
  assertion gates, not describe gates), except here there is not even an
  assertion gate, because there is no `-oss` sibling to differ from.
- **4/4 under `--repeat-each=2`**, 13.9s. Single run 7.8s (≈3.5s/test).
- `bunx tsc --noEmit` clean.
- Runtime is genuinely that fast — probed, not accepted (§3).

## 2. No helper changes, and no new module either

`support/sdk-embed-setup.ts` was consumed read-only and needed **no changes**.
That is now **five consecutive Group B specs** with the same result.

I also did not add `support/sdk-embed-setup-embed-parameters-remapping.ts`.
Everything this spec needs already exists:

| upstream | ported via |
| --- | --- |
| `navigateToEmbedOptionsStep` | `support/sdk-embed-setup.ts` |
| `H.setEmbeddingParameter` | `support/embedding-dashboard.ts` |
| `H.getSimpleEmbedIframeContent` | `getSimpleEmbedIframe` (`support/sdk-iframe.ts`) |
| `H.createNativeQuestionAndDashboard` / `H.createNativeQuestion` | `support/factories.ts` |
| `JWT_SHARED_SECRET` | `support/sdk-iframe.ts` |
| snowplow `afterEach` | `installSnowplowCapture` / `expectNoBadSnowplowEvents` |

The two remaining pieces (`addRemapping`, `assertRemappedWidgets`) are
spec-local by construction: they are literal translations of upstream's two
*duplicated* `beforeEach` bodies and of the assertion block both tests repeat
verbatim. A near-identical `addRemapping` already exists inline in
`tests/native-filters-remapping.spec.ts` — flagging it as a **consolidation
candidate** (`ORDERS.QUANTITY` internal + `ORDERS.PRODUCT_ID`→`PRODUCTS.TITLE`
external remapping is now written out twice), but Cypress also has two copies,
so leaving them duplicated is the faithful state and consolidation is a later
pass's call.

## 3. Mutation results — three independent inversions, all bite

The brief's "probe a suspiciously fast green" applies: 3.5s/test including
`restore()` looked thin for a full wizard drive plus an iframe preview plus
nine filter interactions. It is real. Evidence, run on the jar:

| mutation | result |
| --- | --- |
| `addRemapping` early-returns (no internal, no external remapping) | **both tests fail** at `getByText("N5")` — the internal remapping step |
| only the `ORDERS.PRODUCT_ID → PRODUCTS.TITLE` external remapping removed | **both tests fail** at `toBeVisible()` on "Rustic Paper Wallet" |
| expected PK display value "Hudson Borer" → "Domenica Williamson" | **both tests fail** at that exact locator |

That covers all three remapping families the spec is about (internal values,
FK external remapping, PK→display-name), and the two mutations that invert the
*input* rather than the *expectation* are the stronger form the corrected
absence bullet asks for. It also transitively proves the earlier steps are
live: if `setEmbeddingParameter(…, "Editable")` had silently no-opped, the
widgets would not render in the preview and the first `widget(/Internal/)`
click would have timed out instead.

## 4. The brief's expectation about absence assertions did NOT reproduce

The brief warned this spec "will be full of" `should("not.exist")` and to apply
the corrected `toHaveCount(0)` rule. **It has zero absence assertions.** All 18
assertions are positive: `should("be.visible")`, `should("exist")`,
`should("contain.text", …)`. So the corrected rule had nothing to apply to
here, and nothing in this port is exposed to the vacuity failure mode it
guards against. Stating it plainly rather than manufacturing a near-miss.

Likewise, the brief's two "worth checking" hypotheses:

- **"a remapped display value asserted where the underlying value is what
  changed"** — not present. Every assertion is on the *display* side
  (`contain.text "N5"` / `"Rustic Paper Wallet"` / `"Hudson Borer"`), and the
  input side is driven by the raw value ("1," typed into the ID field). That is
  exactly the right pairing for a remapping test; there is no inversion to
  report.
- **"whether the wizard re-initialises embedding parameters when the resource
  changes"** — not exercised. This spec never switches resource; each test
  picks one resource and stays on it. The `guest-embed-ee` port's finding
  stands and this port neither confirms nor extends it.

## 5. Port deviations (all mechanical, all recorded in the spec header)

- `filter(':contains("X")')` → `filter({ hasText: /X/ })`. jQuery `:contains`
  is a **case-sensitive** substring; Playwright's *string* `hasText` is
  case-**in**sensitive, so the regex is the faithful form. ("FK" and "PK->Name"
  do not collide.)
- `cy.findByText("Add filter")` → `getByRole("button", { name: "Add filter",
  exact: true })`. testing-library's exact `findByText` resolves the single
  element whose *own* text is "Add filter"; Playwright's exact `getByText`
  compares full element text and would match both the `<button>` and its inner
  span → strict-mode violation. Same shape `native-filters-remapping` already
  uses.
- `.type("1,")` on the ID token field → `pressSequentially` (rule 5 — the
  trailing-comma token commit needs real keystrokes).
- `createMockParameter` inlined: every field it defaults
  (`id`/`name`/`slug`/`type`) is overridden at every call site here, and
  `metabase-types` is outside this tsconfig.
- `H.mockEmbedJsToDevServer()` dropped — the standing Group B rationale.
- Snowplow: events are **not** the subject (no `expectUnstructuredSnowplowEvent`
  anywhere in the spec), but `afterEach(H.expectNoBadSnowplowEvents)` is, so
  this uses `installSnowplowCapture` like its landed siblings rather than rule
  6's no-op stub. The bad-event check remains the documented structural
  downgrade (no Iglu validation without micro).

## 6. No product-bug claims

Nothing was fixme'd, nothing was weakened, no cross-check was needed — the port
was green on its first jar run and every fix during authoring was in my own
code (there were none after the first run). One observation deliberately *not*
escalated: the dashboard test never sets `enable_embedding` on its dashboard
and the guest-preselected preview still renders. That matches upstream exactly
and I have no evidence it is anything other than how the wizard's own preview
path works, so it is not a finding.

## 3-line summary

Straight 1:1 port; 2/2 green on the jar, 4/4 under `--repeat-each=2`, tsc
clean, zero skips. Three independent mutations (two of them input inversions)
all turn both tests red, so the remapping assertions are non-vacuous.
**No dividends** — and the brief's absence-assertion hazard does not apply:
this spec has no absence assertions at all.
