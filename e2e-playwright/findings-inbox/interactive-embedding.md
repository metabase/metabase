# interactive-embedding.cy.spec.js → tests/interactive-embedding.spec.ts

Source: 2034 lines / 79 `it()`s. Port: 2624 lines / 79 tests. Slot 8 (:4108).

State when picked up: **complete, not partial.** RESUME.md recorded it as
"mid-write — likely incomplete"; in fact all 79 upstream tests were present,
`tsc --noEmit` was clean, and the iframe harness in
`support/interactive-embedding.ts` already handled the known traps (mb.baseUrl
threading, Set-Cookie splitting, params-before-hash). The previous agent got
further than its last observable action suggested. *Process note: "died
mid-write" in a resume doc is a claim about when the agent stopped, not about
what it had finished — verify before assuming rework is needed.*

## New gotcha (→ PORTING.md): jQuery returns the NAME of a boolean attribute

`cy.findByTestId("main-logo-link").should("have.attr", "disabled", "disabled")`
passes upstream, but the element's real DOM value is `""`:

```html
<a disabled href="/" tabindex="-1" aria-disabled="true" data-testid="main-logo-link">
```

jQuery/Sizzle special-case the boolean attributes (`disabled`, `checked`,
`selected`, …): the getter returns the lowercased attribute *name* when the
attribute is present, rather than `getAttribute()`'s literal value. So
`have.attr("disabled", "disabled")` is really only asserting **presence**.
Playwright's `toHaveAttribute` reads `getAttribute` directly and sees `""`.

Faithful port: `toHaveAttribute("disabled")` (one-arg = presence check).
Porting `("disabled", "disabled")` literally produces a *false failure* — the
app is fine. Applies to any upstream `have.attr` on a boolean attribute.

Classification: **port bug / known-gotcha candidate** — not a product bug.

## INFRA DIVIDEND: snapshots bake in `site-url: http://localhost:4000`, and
## per-worker backends silently route through the *shared dev backend*

The 3 JWT SSO tests failed with "no request to localhost:8888 ever fired".
Root cause is **not** in the spec:

```
$ curl -s http://localhost:4108/api/session/properties | jq .site-url
"http://localhost:4000"
```

The e2e snapshot was generated against port 4000, so `site-url` is persisted
as `http://localhost:4000` in the app DB and **restore() faithfully restores
that** onto a backend listening on :4108. The frontend builds its SSO redirect
from the setting, not from the current origin
(`enterprise/frontend/src/metabase-enterprise/auth/utils.ts`):

```ts
export const getSSOUrl = (siteUrl: string, redirectUrl?: string): string =>
  `${siteUrl}/auth/sso?redirect=${encodeURIComponent(redirectUrl)}`;
```

So the embedded app navigated to `http://localhost:4000/auth/sso?...` — the
**shared dev backend**, which has no `jwt-enabled` and no IdP configured — and
the slot backend's JWT flow was never exercised. The request to :8888 that the
test waits for is issued by whichever backend handles /auth/sso, and :4000
never issues it.

Upstream Cypress passes only because `site-url` *coincidentally equals* its
baseUrl (backend always on 4000). The invariant is invisible until you move the
backend, which is exactly what PW_PER_WORKER_BACKEND does.

**Severity is higher than this one spec.** Two distinct hazards:

1. Any test whose behaviour depends on `site-url` (SSO redirects, emailed/
   public/embed links, anything using the setting to build an absolute URL)
   is silently wrong under per-worker backends.
2. Worse — it makes a slot backend **reach out to port 4000**. The whole
   per-worker design assumes slot isolation, and "never touch port 4000" is a
   standing rule in the brief. Here a slot test was quietly driving traffic at
   the shared dev backend. On a machine where :4000 isn't running, this
   presents as a confusing connection error rather than a config problem; on
   one where it *is* running, it presents as a bogus product-bug signal — the
   app looks like it's ignoring settings you just set, because you're looking
   at a different instance's settings.

**Fix applied here (contained):** the JWT describe's beforeEach sets
`site-url` to `mb.baseUrl`, restoring the invariant upstream gets for free.

**Recommended follow-up (fixture level, deliberately NOT done in this port —
it's a shared-file change and wants its own review):** have `mb.restore()` (or
the per-worker backend bootstrap in support/fixtures.ts) write
`site-url = mb.baseUrl` after every restore, under PW_PER_WORKER_BACKEND. That
removes the landmine for all 350+ remaining specs rather than one-by-one, and
turns a class of future "works on 4000, fails on a slot" mysteries into a
non-event. A cheap safety net worth adding alongside it: assert
`site-url === mb.baseUrl` post-restore and fail loudly, so the next occurrence
names itself.

## INFRA DIVIDEND: the whole spike runs at 1280x**720**, not the 1280x800 the
## config asks for — `devices["Desktop Chrome"]` silently overrides it

`playwright.config.ts` deliberately mirrors Cypress's viewport
(`e2e/support/config.js`: `viewportWidth: 1280, viewportHeight: 800`):

```ts
use: {
  ...
  viewport: { width: 1280, height: 800 },   // global use
},
projects: [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },   // ← wins
],
```

But project-level `use` is merged **over** the global `use`, and

```
$ node -e "…console.log(devices['Desktop Chrome'].viewport)"
{"width":1280,"height":720}
```

so the device descriptor's own viewport silently defeats the line written to
match Cypress. **Every spec in the spike has been running 80px shorter than its
Cypress original.** The config reads as if it does the right thing, which is
why it survived nine waves unnoticed.

Caught by metabase#37437, which asserts the embed's `frame` postMessage reports
the viewport height for a fit-mode page. Expected 800, got **720** — the
viewport number reported straight back to the test. Most specs can absorb 80px
(that's why nobody noticed); this one measures it, so it named the bug.

**Why this matters beyond one spec:** viewport height decides what's scrolled
out of view, what's virtualized away, which responsive breakpoint renders, and
whether "is visible" assertions hold. An 80px delta from the reference harness
is a standing, invisible source of port/Cypress divergence — exactly the kind
of environmental difference that gets misread as a product bug. It also biases
the timing/behaviour comparison the spike exists to produce.

**Fix applied here (contained):** file-level
`test.use({ viewport: { width: 1280, height: 800 } })` in the spec.

**Recommended (deliberately NOT done here — shared file, other slots mid-run):**

```ts
projects: [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
  },
],
```

Do it at a checkpoint when no runs are in flight, then re-verify the landed
specs: some may have been *stabilized against 720* and could shift. That
re-verification is the real cost, and it argues for doing it sooner rather than
after another 350 specs land on the wrong viewport.

## PORTING GOTCHA (big one): Playwright does not route the follow-up request
## of a redirect — Cypress's proxy does. Mocked SSO/IdP flows break silently.

The 3 JWT SSO tests bounce through four redirects:

```
/dashboard/10 → /auth/sso?redirect=… → :8888/jwt-provider (mock IdP)
              → /auth/sso?jwt=… (sets session) → /dashboard/10
```

Every hop must stay intercepted: the app-origin hops to strip
`X-Frame-Options`, and the IdP hop because it's a **mock** — nothing listens on
:8888. But `page.route` handlers are **not invoked for a request the browser
reached by following a redirect**.

Isolated with a control, same URL, same single route registered:

| how :8888 is reached | handler runs? | result |
|---|---|---|
| `page.goto("http://localhost:8888/jwt-provider?control=1")` | **yes** | intercepted, mock served |
| via a 302 `Location:` from a fulfilled response | **no** | real network → `net::ERR_CONNECTION_REFUSED` |

A `page.route(() => true, …)` catch-all — which fires happily for other
cross-origin requests (the :8080 rspack bundles) — is *also* skipped for the
redirect follow-up. So it isn't a bad predicate; the routing layer never sees
the request.

Cypress has no equivalent problem because its proxy sits in front of **every**
hop, so `cy.intercept` keeps applying across a redirect chain. This is a real
behavioural gap between the two harnesses, and it will bite **any** port that
mocks a redirect-based external flow: JWT SSO, SAML, OAuth callbacks, any
`req.redirect()` in a `cy.intercept`.

**The failure mode is nasty**, and worth calling out on its own:

- The port *looked* fine and one of the three tests **passed**. It asserts only
  that a request to the IdP was *attempted* (`waitForRequest`), which is true
  even though the mock never ran and the request died on
  `ERR_CONNECTION_REFUSED`. A green test was reporting a mock that had never
  worked once.
- The other two failed far downstream ("Orders in a dashboard" not visible)
  with a fully rendered 382KB page. Only `fetch("/api/user/current")` from
  inside the frame → `401 Unauthenticated`, and a cookie jar holding
  `metabase.TIMEOUT`/`metabase.DEVICE` but **no `metabase.SESSION`**, pointed
  back at the auth hop. Everything in between invited a wrong diagnosis — I
  first suspected the harness's Set-Cookie splitting, which was innocent.

**Fix:** `mockRedirectResponse` / `fulfillAsClientRedirect` in
`support/interactive-embedding.ts` — fulfill a 3xx as a tiny document doing
`location.replace(<target>)`. That makes the next hop a *fresh* navigation,
which Playwright does route. `replace` (not `assign`) keeps history identical
to a real redirect. Applied in two places: the harness's document proxy (any
3xx from the app) and the spec's IdP mock (replacing
`route.fulfill({status: 302, headers: {location}})`).

Result: 3/3 JWT SSO tests pass in ~5s each.

**Generalise at consolidation:** `mockRedirectResponse` belongs in a shared
module — it is not embedding-specific. Worth a lint/codemod note too: in a
Playwright port, `route.fulfill({ status: 3xx, headers: { location } })` is
almost always a latent bug unless the next hop needs no interception.

## PORTING GOTCHA: `should("not.be.visible")` for a scrolled-away element is
## NOT `not.toBeVisible()` — Playwright ignores overflow clipping

metabase#30645 scrolls a dashboard to the bottom and asserts a text card is no
longer visible. After the scroll the element is measurably gone:

```
scrollTop=354 (max), textRect: top=-144.6 bottom=-119.0   // above the viewport
```

…and Playwright still reported it **visible**. `toBeVisible` checks only for a
non-empty bounding box and `visibility != hidden`; an element scrolled out of
an overflow container has both. Cypress's visibility rules explicitly cover
"clipped by an ancestor's overflow" and call it not visible.

Faithful port: **`not.toBeInViewport()`**. Applies to any upstream
`should("not.be.visible")` whose mechanism is scrolling/clipping rather than
`display:none` / `visibility:hidden` — where the two harnesses genuinely
disagree, and the port silently asserts something weaker than the original.

## PORTING GOTCHA: `cy.scrollTo(…, { duration })` is not
## `scrollTo({ behavior: "smooth" })` under reducedMotion

Same test. Cypress's `cy.scrollTo("bottom", { duration: 2 * FPS })` is jQuery
`.animate()` assigning `scrollTop` frame by frame — plain JS, unaffected by
`prefers-reduced-motion`. The port used
`element.scrollTo({ top: …, behavior: "smooth" })`, and the config sets
`contextOptions: { reducedMotion: "reduce" }`, under which Chromium **does not
perform the programmatic smooth scroll at all** — `scrollTop` stayed `0`, so
the test's scroll silently never happened.

Nothing errors; the page just doesn't move, and the failure lands on a later
assertion. Fix: animate `scrollTop` by hand across `requestAnimationFrame`s,
which preserves both properties the test needs (it scrolls, and it isn't
instant — this test's whole point is that an instant scroll masks the bug).
Note for the suite: **any** ported `behavior: "smooth"` scroll is a no-op under
our config. `scrollIntoViewIfNeeded()` / `mouse.wheel()` are unaffected.

## Helper duplication for the consolidation pass (do NOT edit search.ts now)

`support/interactive-embedding.ts` `visitFullAppEmbeddingUrl` is a generalized
copy of the harness in `support/search.ts`. The copy is a strict superset:

- `qs` optional; URL built via the URL API so params land **before** the hash
  (`/question#<adhoc-hash>` needs this — search.ts's string concat appends
  after the hash and corrupts the fragment);
- harness page records incoming `message` events (it *is* the embed's real
  `window.parent`, so the postMessage protocol is observed where a real host
  would see it — no `cy.spy` / synthetic `MessageEvent` needed);
- `Set-Cookie` applied to the browser context via `getSetCookie()` rather than
  forwarded — undici merges multiple `Set-Cookie` headers into one
  comma-joined string, which corrupts the JWT SSO flow's session cookies;
- 3xx fulfilled as-is so the browser follows redirects inside the iframe.

**Recommendation**: consolidate onto *this* version and have search.ts import
it — the three deltas above are latent bugs in the search.ts copy, not
spec-specific quirks. The Set-Cookie one in particular will bite any future
port that authenticates inside the frame.

Also duplicated here (Page-only upstream, needed for `FrameLocator` scope):
`appBar`, `sideNav`, `popover`, `modal`, `icon`, `getNotebookStep`,
`getDashboardCard`, `dashboardGrid`, `dashboardHeader`, `assertTableRowsCount`.
The generic-`Scope` versions are the better shape; consolidation should widen
the originals' signatures (`Page` → `Page | FrameLocator`) rather than keep two.
