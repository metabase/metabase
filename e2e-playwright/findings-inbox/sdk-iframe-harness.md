# SDK-iframe embedding tier — feasibility verdict + shared harness

Slot 5 (:4105), jar mode, `target/uberjar/metabase.jar`.

Deliverables: `support/sdk-iframe.ts` (harness),
`tests/sdk-iframe-authentication.spec.ts` (proof spec, 16/16 green,
32/32 under `--repeat-each=2`), `bunx tsc --noEmit` clean.

---

## 1. VERDICT: the tier is portable. Nothing here is a hard blocker.

The three things that had been assumed to block this tier all turned out to be
false or cheap:

- **`embed.js` needs no SDK build.** The backend serves it itself. Confirmed
  two ways: `frontend_client/app/embed.js` is present in the uberjar (82,224
  bytes), and `GET :4105/app/embed.js` returns exactly 82,224 bytes off the
  slot backend. Upstream's `mockEmbedJsToDevServer` (redirect to the rspack
  dev server at :8080) exists purely for local hot reload and is **dropped** —
  jar mode is the verification default, so there is nothing to hot-reload.
- **The hardcoded `http://localhost:4000` is not structural.** It appears in
  three places that must agree (script `src`, `instanceUrl`, and the test-page
  origin, which upstream leaves as `""` = Cypress's baseUrl). All three are
  now derived from `mb.baseUrl`. No product code reads :4000.
- **`visitCustomHtmlPage` is a one-liner in Playwright.** `page.route()` +
  `route.fulfill()` serves the arbitrary HTML document; `page.goto()` visits
  it. It is *less* machinery than the Cypress version, not more.

The tier also splits into two groups that were previously lumped together, and
this materially changes the cost estimate — see §5.

## 2. What the harness does (`support/sdk-iframe.ts`)

Ports of `e2e-embedding-iframe-sdk-helpers.ts`, `embedding-sdk-helpers.ts` and
`e2e-jwt-helpers.ts`:

| upstream | ported as | notes |
| --- | --- | --- |
| `prepareSdkIframeEmbedTest` | same | restore + admin + token + `enable-embedding-simple` + auth mocks. Drops the `cy.intercept(...).as()` aliases (PORTING.md rule 2: specs arm their own `waitForResponse`) and `mockEmbedJsToDevServer`. |
| `loadSdkIframeEmbedTestPage` | same | returns a `FrameLocator`. |
| `visitCustomHtmlPage` | same | |
| `getSdkIframeEmbedHtml` / `getNewEmbedScriptTag` / `getNewEmbedConfigurationScript` | same, `mb`-parameterised | |
| `getSimpleEmbedIframeContent` | `getSimpleEmbedIframe` | |
| `waitForSimpleEmbedIframesToLoad` | same | |
| `getSignedJwtForUser` | same | HS256 via node `crypto` instead of `jose` (which is in the repo-root `node_modules`, not this package's). Two-line HMAC; avoids a new dependency. |
| `mockAuthProviderAndJwtSignIn` | same | |
| `enableJwtAuth`, `enableSamlAuth` | same | `enableSamlAuth` reads the cert off disk instead of `cy.readFile`. |
| `mockAuthSsoEndpointForSamlAuthProvider` | same | matched on `mb.baseUrl`'s origin, not a relative path. |
| `stubWindowOpenForSamlPopup` | same | `addInitScript` instead of a post-load `cy.stub` — strictly less racy. |
| — | `stubWindowOpenInert` | extracted from an inline `cy.stub` in the spec. |
| — | `assertEmbedTargetsThisSlot`, `writeSlotMarker`, `readApplicationNameFromEmbed` | new; the anti-#39 guard, see §4. |

~~**Not yet ported:** `prepareGuestEmbedSdkIframeEmbedTest` (needed by 3 specs).~~
**LANDED 2026-07-20** in `support/sdk-iframe-guest-token-refresh.ts`, alongside
`signGuestJwt`. `content-translations` already consumes both read-only. Do not
rebuild it — import from there. (Also note `guest-embed-ee`/`-oss` turned out
NOT to need it: they reach the guest page via
`loadSdkIframeEmbedTestPage({ metabaseConfig: { isGuest: true } })`, which
`support/sdk-iframe.ts` supports unchanged.)
It is the same shape as `prepareSdkIframeEmbedTest` plus
`enable-embedding-static` and `embedding-secret-key`; ~20 lines, no new risk.

## 3. Two environmental blockers found and solved — neither is a product bug

Both are cases where Cypress's `chromeWebSecurity: false` was silently doing
work the Playwright config does not do (it only sets `bypassCSP`, which is CSP
and not CORS/PNA).

**(a) Credentialed CORS on the mock JWT provider.** The SDK fetches
`http://auth-provider/sso` with `credentials: "include"`. A wildcard
`Access-Control-Allow-Origin: *` is rejected by the browser for credentialed
requests, so auth failed with `net::ERR_FAILED` →
`MetabaseError: Failed to fetch JWT token`. Fix: echo the caller's `Origin`
header and send `Access-Control-Allow-Credentials: true`.

**(b) Private Network Access blocks the "production origin" tests.** The two
production tests serve the customer page from a non-localhost origin, because
`_getIsLocalhost` (`frontend/src/metabase/embedding/embedding-iframe-sdk/embed.ts:388-400`)
decides `isProduction` from `window.location.hostname`. Upstream uses
`http://example.com`. Chromium refuses:

> Access to script at 'http://localhost:4105/app/embed.js' from origin
> 'http://example.com' has been blocked by CORS policy: The request client is
> not a secure context and the resource is in more-private address space
> `loopback`.

`embed.js` never loads, so the iframe is never created and the test times out
on a missing element — which looks exactly like a product regression.
**`grantPermissions(["local-network-access"])` does NOT lift this** — the
blocker is the secure-context requirement, not the permission. (Worth flagging
against FINDINGS #7's harness, which relies on that grant; it works there
because the page origin is already loopback.)

Fix, in `productionSafeOrigin()`: upgrade a non-loopback `http://` origin to
`https://`. The page is route-fulfilled so no real TLS is involved, and
`http://localhost` is a "potentially trustworthy" origin so loading `embed.js`
from an https page is **not** mixed content. Faithful, because
`_getIsLocalhost` reads hostname only — the scheme is invisible to the
behaviour under test.

The alternative (a Chromium launch flag) would need an edit to the shared
`playwright.config.ts`; this fix is contained in the harness.

## 4. How I proved the harness talks to MY slot (the #39 discipline)

Content assertions cannot prove this: `:4000` has the same sample data, so
"Orders in a dashboard is visible" passes against the wrong backend. So the
harness ships a two-leg guard and I falsified both.

- **Leg 1 (structural)** — the embed iframe's `src` origin, and the iframe
  document's own `location`, must equal `mb.baseUrl`.
- **Leg 2 (behavioural)** — a slot-unique marker written to *this* slot's app
  DB (`application-name`) must be readable from **inside the embed iframe's own
  document** via `fetch("/api/session/properties")`. Asserted through the
  frame's runtime, so nothing the harness injected into the page can satisfy it.

**Falsification runs (both passed):**
1. Wrote marker → read it back through the iframe → matched, and `!= "Metabase"`
   (the default). Re-wrote a second marker and re-read → tracked the change,
   proving it is live backend state.
2. Deliberately set `instanceUrl` to another live slot backend (`:4104`,
   read-only, one GET) — the #39 shape exactly. The guard rejected it:
   `Expected pattern: /^http:\/\/localhost:4105/ Received: "http://localhost:4104/embed/sdk/v1..."`.

**Scope caveat, stated explicitly:** `:4000` was **not running** during my
session (`curl :4000/api/health` → no response). So on this box a :4000
misdirection would have failed loudly rather than silently. The guard is what
makes the result trustworthy on a box where :4000 *is* up — which is the normal
developer machine, and was the exact condition of #39.

## 5. Cost for the remaining 27

The tier is **not** one block. It is two, and the second is much cheaper than
assumed:

**Group A — `sdk-iframe-embedding/` (14 remaining).** Genuinely need this
harness. All of the URL/auth/CORS/PNA groundwork is now done, so these are
ordinary ports.

| spec | lines | notes / foreseen blockers |
| --- | --- | --- |
| `reproductions` | 28 | trivial |
| `missing-tokens` | 61 | uses `origin:` → covered by `productionSafeOrigin` |
| `sdk-pdf-downloads` | 94 | `verifyDownload` — `support/downloads.ts` already exists |
| `sdk-csv-downloads` | 115 | same |
| `guest-embed` | 120 | needs `prepareGuestEmbedSdkIframeEmbedTest` (~20 lines) + `downloadAndAssert`; `Cypress.expose("IS_ENTERPRISE")` → env check |
| `content-translations` | 213 | needs the guest-embed prepare fn |
| `metabase-browser` | 218 | plain |
| `theming` | 264 | plain; `theme` already threads through `metabaseConfig` |
| `view-and-curate-content` | 342 | plain |
| `embed-options` | 365 | plain |
| `eajs-internal-navigation` | 484 | 5× `visitCustomHtmlPage`, plain |
| `custom-elements-api` | 712 | 31× `visitCustomHtmlPage` — mechanical but the single biggest file of literal HTML to rewrite |
| `sdk-iframe-embedding` | 879 | 3× `origin:`; an auto-refresh block where upstream **gives up on `cy.clock()`** ("doesn't seem to work with mocking the timing inside the iframe") and uses real timeouts. **Likely capability win**: `page.clock` installs into frames, so these may become fast and deterministic instead of real-time waits. Worth a dedicated look. |
| `guest-token-refresh` | 1018 | 16 loads / 12 prepares, all guest-embed; needs the guest prepare fn. Largest, but highly repetitive. |

**Group B — `sdk-iframe-embedding-setup/` (13 specs).** **These do not use the
embed.js harness at all.** They are ordinary in-app admin-UI tests: they
`cy.visit("/admin/embedding")` and drive the embed-setup flow, with the preview
rendering in an in-app `[data-iframe-loaded]` iframe. Only 2 of the 13 touch
`loadSdkIframeEmbedTestPage` (once each). What they actually need is a port of
the 200-line spec-local `helpers/index.ts` (`getEmbedSidebar`,
`visitNewEmbedPage`, `navigateToStep`, …) into a `support/sdk-iframe-setup.ts`.
That is a normal helper port with no novel infrastructure.

**Estimate.** Group A: ~1 agent-session per spec for the four ≥480-line files
(`custom-elements-api`, `sdk-iframe-embedding`, `guest-token-refresh`,
`eajs-internal-navigation`), ~2-3 specs per session for the rest — call it
**7-9 sessions**. Group B: one session to port `helpers/index.ts` first (the
batch rule again), then **4-5 sessions** to fan out. **Total ~12-14 sessions**,
with the highest-variance item being `guest-token-refresh` (size) and the
highest-upside item being `sdk-iframe-embedding`'s auto-refresh block.

## 6. Fixes needed on the proof spec — all harness, none product

3 of 16 failed on first full run; all three were mine:

1. ×2 — the PNA/production-origin blocker (§3b).
2. ×1 — `findByText("Failed to authenticate…")` exact-match. The message and its
   "Read more." link share one text container, so an exact match finds nothing.
   Ported as `toContainText` on the error container. (Instance of the known
   testing-library-exact-match class, PORTING.md rule 1, with the twist that
   the *upstream* assertion is the loose one here.)

**No product-bug claims from this port.**

## 7. Strengthened vs upstream

- The two SAML tests replace a post-load `cy.stub(win, "open")` with an
  `addInitScript` stub, closing a race upstream simply tolerates.
- `can use existing user session…` additionally asserts the embed is on this
  slot's backend (both guard legs). Upstream asserts nothing about which
  instance answered.
