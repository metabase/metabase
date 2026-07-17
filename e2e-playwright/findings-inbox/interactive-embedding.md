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
