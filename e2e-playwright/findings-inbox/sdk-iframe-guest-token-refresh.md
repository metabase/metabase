# sdk-iframe guest-token-refresh — port findings

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/guest-token-refresh.cy.spec.ts` (1019 lines)
Target: `e2e-playwright/tests/sdk-iframe-guest-token-refresh.spec.ts` + `support/sdk-iframe-guest-token-refresh.ts`
Slot 2 (:4102), jar mode (`target/uberjar/metabase.jar`, COMMIT-ID `751c2a98`; backend
`/api/session/properties` reports `version.hash 751c2a9`, process is `java -jar …/metabase.jar`).

**16 tests, 16 executed, 16 passed. 0 skipped, 0 gate-skipped, 0 `fixme`.
32/32 under `--repeat-each=2`. `bunx tsc --noEmit` clean.
`support/sdk-iframe.ts` NOT modified (eighth Group A/B spec in a row).
No product-bug claims.**

Green on the first full run — nothing needed fixing during stabilisation.

---

## 1. The headline: this spec did NOT need `page.clock`, and using it would have been LESS faithful

The brief expected clock-stepping to be how token expiry gets driven, and flagged
tick-coalescing as the most likely way the port goes wrong. **Neither applies
here.** I want to state that plainly, because the expectation is reasonable from
the spec's title and wrong about its contents.

The spec never advances time. It reaches "the token is expired" two ways, both of
which are direct state, not elapsed time:

| case | how expiry is reached |
| --- | --- |
| the 8 "refresh-only" / initial-token tests | the token is signed **already expired** (`expirationSeconds: -60`), or there is no token at all (initial-token fetch) |
| the 4 filter-interaction tests | the product's own test hook, `window.FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS`, set on the embed iframe's window |

There is no repeating in-iframe timer under test — nothing analogous to
`sdk-iframe-embedding`'s 1 s `useDashboardRefreshPeriod` interval — so there is
nothing to step and no coalescing hazard to fall into. `page.clock` is not
imported by this port.

**The interesting part is the hook.** `embedding-sdk-bundle/store/guest-embed/auth.ts`
carries a test-only branch with this comment:

> Cypress can't mock time inside an iframe, so we support a window flag that
> forces a token refresh for testing purposes.

The sibling `sdk-iframe-embedding` port **disproved the premise of that comment
for Playwright** — `page.clock` demonstrably reaches into the embed iframe. So
this port *could* have deleted the hook usage and advanced virtual time past
`session.exp` instead. I deliberately did not, for two reasons:

1. **Faithfulness.** The hook forces `shouldRefreshToken` directly; a clock jump
   would exercise the `session.exp * 1000 < Date.now()` comparison instead. Those
   are different branches of the same `if`. Swapping them is a *different test*,
   not a port of this one.
2. It would make the port's result non-comparable with the Cypress original in
   exactly the place the port is most likely to be wrong.

**Recorded as a follow-up, not claimed as a dividend:** the comment in
`auth.ts` is now factually stale for a Playwright harness, and
`FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS` is a production-shipped test hook
that a `page.clock`-based test would not need. That is a plausible product
cleanup, but it is a *change to the app*, not something this port establishes,
and I have not verified that a clock jump actually drives this particular code
path. Stated as a lead only.

## 2. What the port needed that the harness did not have

Both live in `support/sdk-iframe-guest-token-refresh.ts`; `support/sdk-iframe.ts`
is consumed read-only.

- **`prepareGuestEmbedSdkIframeEmbedTest`** — the ~20-line gap
  `findings-inbox/sdk-iframe-harness.md` §2 flagged. It is exactly as advertised:
  restore + admin + token + `enable-embedding-simple` + `enable-embedding-static`
  + `embedding-secret-key` + signOut. Two deviations, both the standard ones:
  `mockEmbedJsToDevServer` dropped (jar mode), and the three
  `cy.intercept(...).as()` aliases dropped — **none of them is ever awaited by
  this spec**, so there was nothing to port.
  Upstream gates `activateToken` on `IS_ENTERPRISE`; the spike backend is always
  the EE jar, so it is unconditional here, matching the shared
  `prepareSdkIframeEmbedTest`.
- **`signGuestJwt`** — a general-payload HS256 signer. The harness only exports
  `getSignedJwtForUser`, whose payload is an SSO user claim set; a guest token is
  `{ resource, params, exp }`. `iat` is set explicitly, per PORTING — and the
  mutation in §4 proves the backend really validates these claims rather than
  waving the token through.

## 3. The `embedding_type` trap in the Cypress card factory (worth generalising)

The spec passes `embedding_type: "guest-embed"` to `H.createQuestion` /
`H.createNativeQuestion` for the three question fixtures. **Upstream's
`question()` helper silently drops it** — it is not in the destructure list and
appears in neither the POST nor the follow-up PUT (`api/createQuestion.ts`). So
the cards upstream creates carry `enable_embedding: true` and the *default*
embedding type.

Our shared `factories.createQuestion` spreads unknown keys into the POST, so
passing it through would have made the port **differ** from the original — in the
direction of "more correct", which is the harder kind to notice. The port drops
it, with a comment at each of the three call sites' shared helper.

This is another instance of PORTING's "Cypress's `create*` API helpers are not
thin wrappers — read the helper's body before porting its signature", and the
first one where the mismatch runs the *other* way: the shared Playwright factory
is more permissive than the Cypress one, so a literal transcription of the spec's
arguments quietly strengthens the fixture. Worth a sweep: any port that passes
`embedding_type` to `createQuestion`/`createNativeQuestion` has the same skew.
(Dashboards are fine — `createDashboard` does forward it, both sides.)

## 4. Mutation checks — three, all killed the tests

Per the brief, every mutation flips an **input**, not an expectation.

| # | mutation | tests affected | result |
| --- | --- | --- | --- |
| **A** | the provider returns the **expired** token instead of the fresh one (dashboard refresh-only happy path) | 1 | **FAILS** — iframe body reads `Token is expired (1784513069)`, never "Orders". Proves the refresh is load-bearing *and* that `exp`/`iat` are genuinely validated by the backend, i.e. the local HS256 signer is producing real tokens. |
| **B** | `forceGuestTokenRefresh` removed (all 4 filter tests) | 4 | **ALL FAIL** — `waitForResponse` on the provider times out at 60 s, 4/4. |
| **C** | the "wrong response shape" tests get a **well-shaped** `{ jwt }` body | 4 | **ALL FAIL** — the error text never renders. |

**Mutation B is the one that mattered**, and it settles a vacuity question the
port shape raises. The four filter tests use a **5-second** initial token, and
upstream's `cy.wait("@guestTokenProvider")` consumes a *past* response — so if
the page took longer than 5 s to load, a refresh would have fired during load and
the wait would be satisfied retroactively by something the filter click had
nothing to do with. Ported as an armed-before-load `waitForResponse` (same
retroactive semantics, deliberately), that hole would port across.

B proves the hole is not open on this backend: with the hook disabled, **zero**
provider requests occur in 60 s of a fully-rendered dashboard/question. The
5-second token never expires within the test because the page loads in well under
a second on the jar. So the assertion is anchored on a refresh that the forced
hook plus the interaction genuinely caused.

**Scope caveat:** that is a statement about *this* backend's load time, not a
structural guarantee. On a slow/contended runner where the load exceeds 5 s, both
the original and this port would be satisfied retroactively and the assertion
would go vacuous — silently, in the passing direction. The fix would be a
provider-response *counter* checked across the click rather than a single wait;
I did not make that change because it is a strengthening upstream does not have,
and the brief's rule is faithfulness. Flagging it as the one place this spec is
fragile-by-construction.

## 5. Smaller port notes

- **`FORCE_REFRESH_… ` is a genuine reach into the embed document.** Contrast
  `findings-inbox/sdk-iframe-embedding.md` §7, where `frame.window()` in Cypress
  actually yields the top-level AUT window. Here upstream uses
  `cy.get("iframe[data-metabase-embed]").its("0.contentWindow")`, which really is
  the iframe's window — and it has to be, because the flag is read by SDK code
  running *inside* the frame. Ported through a real `Frame` handle
  (`FrameLocator` has no `evaluate`). Customer page and embed iframe are
  same-origin here (both `mb.baseUrl`), so this works exactly as upstream.
- **The mock provider needs no CORS handling.** `guestEmbedProviderUri` is a
  relative path and `embed.js` resolves it against `window.location.origin`
  (`embed.ts#_callGuestTokenProvider`), so on the slot model the POST is
  same-origin. None of the harness §3 / embedding §2 CORS-and-mixed-content
  machinery applies — this spec never uses a production `origin:`, which is the
  precondition for all of it. `embed.js` always appends `?response=json`, so the
  route matcher is on pathname.
- **The two error-message assertions can safely be exact matches.** `SdkError`
  appends a "Read more." anchor into the same text container *only* when
  `ERROR_DOC_LINKS[error.code]` exists, and it has exactly one entry
  (`EXISTING_USER_SESSION_FAILED`). `CANNOT_FETCH_JWT_TOKEN` and
  `DEFAULT_ENDPOINT_ERROR` render as the whole content of their own `<Box>`. This
  is the *inverse* of the harness §6 finding, where the exact match had to be
  loosened — so the rule is "check `ERROR_DOC_LINKS`", not "always loosen".
- `cy.button("Add filter")` → `getByRole("button", { name, exact: true })`;
  `H.popover()` / `H.assertTableData()` are called inside
  `getSimpleEmbedIframeContent().within(...)`, where `cy.get`/`cy.findByTestId`
  resolve against the iframe body, so both are scoped to the `FrameLocator`.
- No `.first()` and no `force: true` anywhere in this port — none was needed.

## 6. Consolidation candidate

`assertTableData` now exists in three shapes: page-only
(`multiple-column-breakouts.ts`), `Locator`-scoped (`data-model.ts`), and
`FrameLocator | Locator`-scoped (this module). Cypress has exactly one
`H.assertTableData`, so unifying on a `Page | FrameLocator | Locator` scope stays
faithful and is a clean three-way merge.

---

## Three-line summary

The brief's central expectation did not reproduce: **this spec needs no clock at
all** — expiry is reached by signing an already-expired token or by flipping the
product's own `FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS` hook inside the embed
iframe, so there is no repeating timer and no tick-coalescing hazard; using
`page.clock` here would have exercised a *different* branch of
`getOrRefreshGuestSession` and been less faithful, not more. Three
input-flipping mutations killed 9 of the 16 tests between them, including the one
that mattered — disabling the force-refresh hook produces **zero** provider
requests in 60 s across all four filter tests, proving those "the token was
refreshed" waits are not satisfied retroactively by the load (with the honest
caveat that on a runner slow enough to outlast the 5 s initial token, upstream
and this port would both go vacuous). The only novel trap was upstream's
`question()` helper silently dropping `embedding_type`, where our shared factory
forwards it — a case of the Playwright helper being *more* permissive than the
Cypress one, which quietly strengthens a fixture and is worth sweeping for.
