# sdk-iframe-embedding — port findings

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/sdk-iframe-embedding.cy.spec.ts` (880 lines)
Target: `e2e-playwright/tests/sdk-iframe-embedding.spec.ts` + `support/sdk-iframe-embedding.ts`
Slot 2 (:4102), jar mode (`target/uberjar/metabase.jar`, COMMIT-ID 751c2a98).

**20 tests, 20 executed, 20 passed. 0 skipped, 0 gate-skipped, 0 `fixme`.
40/40 under `--repeat-each=2`. `bunx tsc --noEmit` clean.
No product-bug claims.**

---

## 1. VERDICT ON `page.clock`: it works in the embed iframe. Measured, not inferred.

Upstream's own comment in the `auto-refreshing dashboard` describe:

> Unfortunately, cy.clock() doesn't seem to work with mocking the timing inside
> the iframe, so we have to use real timeouts here.

**`page.clock` does reach inside the iframe.** Playwright installs the clock on
the whole `BrowserContext`, and the docs say so explicitly ("the time in all the
pages *and iframes* is controlled by the same clock"). I did not take the docs'
word for it — here is what was measured, from inside the embed frame's own
runtime, on the loaded dashboard:

| probe (evaluated in the embed `Frame`) | result |
| --- | --- |
| `String(window.setTimeout)` | `(...args) => { return api[method].apply(api, args); }` — Playwright's stub, **not** native |
| frame `Date.now()` before/after `page.clock.runFor(5000)` | delta **exactly 5000** |
| parent `Date.now()` over the same call | delta exactly 5000 (one clock, both documents) |
| node `Date.now()` vs page `Date.now()` after `install()` | skew **0 ms** |

So the timer the dashboard's refresh runs on — `useDashboardRefreshPeriod` →
`@mantine/hooks` `useInterval`, a 1 s `setInterval` living in the *SDK bundle
inside the iframe* — is drivable from the test.

### The dividend, stated precisely

Both tests now **freeze real time** (`clock.pauseAt`) and advance virtual time.
That changes what the tests can assert, not just how fast they are:

- `does not automatically refresh …` — upstream waits **1 second of real time**
  and asserts the request count did not move. The port advances **30 virtual
  seconds** and asserts the same thing, at roughly the same wall clock. A 30×
  wider window, and — unlike upstream — nothing *can* move the timer except the
  test, so a refresh scheduled at, say, 5 s cannot slip past unobserved.
- `automatically refresh …` — upstream leans on Cypress's implicit retry of
  `should("have.length.above", …)`, i.e. it waits real seconds. The port
  advances one virtual second per poll iteration. With real time frozen this
  can **only** pass if `runFor` reaches the iframe's timer, which is what makes
  the negative test above non-vacuous.

Wall clock, this slot, jar mode: the two tests run in **2.3 s and 1.1 s**. The
honest framing of the saving is *small* — upstream's real waits were only ~1–2 s
to begin with — so the win here is **determinism and assertion width**, not
speed. I am not claiming a runtime dividend.

### The non-obvious part: advance in STEPS, never one big jump

This cost about 20 minutes and is the reusable lesson.

| how the clock was advanced | refreshes observed (`autoRefreshInterval: 1`) |
| --- | --- |
| `runFor(1000)` × 12 | **12** — exactly one per virtual second, 2/2 runs |
| `runFor(3000)` once | **0** |
| `runFor(5000)` once | **1** |

A jump larger than the interval fires the repeating timer's due ticks
back-to-back within one task; the dashboard's refresh path coalesces them (and
at 3000 produced nothing observable at all). Stepping at the interval's own
period is what actually models the passage of real time. **Any port driving a
repeating app timer with `page.clock` should step, not jump** — a single big
`runFor` on a *negative* assertion would be a silently vacuous pass.

This also **refines the wave-12 note in PORTING.md** ("`page.clock.install()`
does NOT freeze time — it ticks at real rate; `runFor` only adds jumps"). That
is right about `install()` and it is the reason the page can still load
naturally, but the missing half is that `pauseAt` *does* freeze it, and
`runFor`-after-`pauseAt` gives full control — including inside iframes.

### Is this the #1/#44 pattern (an input Playwright drives that Cypress cannot)?

**Partly, and I want to be careful.** What is established: upstream *tried*
`cy.clock()` here, concluded it did not work through the iframe, and wrote real
timeouts with a comment saying so; `page.clock` demonstrably does work through
the iframe. What is **not** established: that `cy.clock()` is *incapable* of it.
I did not attempt to make `cy.clock()` work — that would mean re-litigating
someone else's abandoned attempt, and it is not what this session was for. So
the claim is "upstream gave up on a control Playwright gives us for free and
which measurably works", not "Cypress structurally cannot". Weaker than #1/#44;
still a real capability difference on the page.

---

## 2. Two more environmental blockers, same class as the harness's §3

Both are **`chromeWebSecurity: false` doing invisible work again**, and both hit
only the three `analytics` tests — the ones serving the customer page from
`http://different-than-metabase-instance.com`, which the harness upgrades to
`https://` to clear Chromium's Private Network Access rule (harness §3b). Both
look like the embed is broken (the iframe simply never renders content).

**(c) Cross-origin `/auth/sso` has no CORS headers.**
```
Access to fetch at 'http://localhost:4102/auth/sso' from origin
'https://different-than-metabase-instance.com' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present.
```
The fix is **the product's own mechanism**, not a route patch: set
`embedding-app-origins-sdk` (here `"*"`). `server/middleware/security.clj`
`access-control-headers` emits `Access-Control-Allow-Origin` off exactly that
setting, and localhost origins are auto-allowed — which is why no other spec in
this tier has ever needed it. A real cross-origin embed host has to configure
it, so this is faithful rather than a weakening.

**(d) The mock JWT provider is `http://`, and the page is now `https://`.**
```
Mixed Content: The page at 'https://different-than-metabase-instance.com/…'
requested an insecure resource 'http://auth-provider/sso'. This request has
been blocked.
```
`http://localhost` is exempt as a potentially trustworthy origin;
`http://auth-provider` is not. Fix: `useHttpsMockJwtProvider`
(`support/sdk-iframe-embedding.ts`) points `jwt-identity-provider-uri` at
`https://auth-provider/sso` and routes it, reusing the harness's exported
`getSignedJwtForUser` and its credentialed-CORS header handling verbatim. The
scheme is invisible to the behaviour under test — the provider is a mock whose
URL the backend just echoes back through `GET /auth/sso`.

**Generalisable rule for the rest of Group A:** the moment a spec combines a
`origin:` (production) page **with a flow that actually authenticates**, expect
both. The already-landed authentication spec did not hit them because its two
production tests fail early, inside `embed.js`'s own validation, before any
cross-origin fetch happens.

`support/sdk-iframe.ts` was **not modified** — everything above lives in the new
`support/sdk-iframe-embedding.ts`.

---

## 3. Snowplow: `installSnowplowCapture` reused unmodified — now five specs

The `analytics` describe is a snowplow-subject block (PORTING rule 6's no-op
stub would have made 4 tests vacuous), so `installSnowplowCapture` was used.
**Zero modifications**, and this is the first use where the tracker runs
**inside a cross-origin iframe** rather than the app page: the `addInitScript`
`MetabaseBootstrap` override applies to all frames, and re-pointing the
collector at the app's own origin keeps the POST same-origin *from the iframe*,
so the no-preflight property still holds. That extends the helper's proven range
meaningfully.

One deliberate deviation, in the *stricter* direction being relaxed: upstream's
`expectUnstructuredSnowplowEvent({…, components: []}, 0)` relies on its
`isDeepMatch` iterating only the expected array's indices, so `[]` matches any
array — i.e. it means "ignore components". Our shared `isDeepMatch` compares
array lengths, which for a **count-0** assertion would make the test *easier* to
pass. Ported as a predicate over `event` + `global` only, which is upstream's
actual meaning. (For the two count-1 assertions the length check is a genuine
strengthening and both pass — the expected property lists are exhaustive, as
`embedding-iframe-sdk/analytics.ts` confirms.)

---

## 4. Mutation checks on the negative assertions

Every negative assertion was falsified, not assumed:

| assertion | mutation | result |
| --- | --- | --- |
| "does not auto-refresh" (count unchanged over 30 virtual s) | add `autoRefreshInterval: 1` | **FAILS** — `Expected: 2, Received: 5` |
| "no usage event in the preview" (count 0) | expect count 1 | **FAILS** — `Expected: 1, Received: 0`, i.e. the capture is live and genuinely sees nothing |
| `proxyCallCount === 0` (analytics proxy) | — | guarded **in-test**: the same run asserts a `setup` event *was* captured by the collector, so an inert tracker cannot satisfy the zero |

---

## 5. Anti-#39 guard: exercised, both legs

The full suite runs in **23 s for 20 tests** on a warm jar backend, which is
exactly the shape that should trigger suspicion. `displays a dashboard` was
therefore strengthened to run the harness's two-leg guard:

- **Leg 1 (structural)** — `assertEmbedTargetsThisSlot`: the iframe's `src`
  origin *and* the iframe document's own `location` are `:4102`.
- **Leg 2 (behavioural)** — a slot-unique `application-name` marker written to
  this slot's app DB, read back via `fetch("/api/session/properties")` **from
  inside the embed iframe's own runtime**. :4000 cannot produce it.

Both pass, 2/2 under `--repeat-each=2`. So the speed is real (jar backend +
warm browser cache), not a misdirection.

**Scope caveat:** `:4000` was not running during this session, so a
misdirection would also have failed loudly here. The guard is what makes the
result trustworthy on a box where :4000 *is* up.

---

## 6. Fixes needed while stabilising — classification

3 of 20 failed on the first full run, plus 1 clock test. All four were mine or
environmental; none were product.

| # | fix | class |
| --- | --- | --- |
| 1–3 | `analytics` tests: cross-origin `/auth/sso` CORS + mixed-content mock provider | **new gotcha** (§2 — recorded above, generalises to the rest of Group A) |
| 4 | clock test used one `runFor(3000)` instead of stepping | **new gotcha** (§1 — recorded above) |

---

## 7. Other port notes worth keeping

- **`frame.window()` in Cypress yields the AUT (top-level) window**, not the
  iframe's, whatever the chained subject. Three tests in this spec look like
  they reach into the embed document and in fact operate on the *customer
  page*, where the `<metabase-question>` / `<metabase-dashboard>` custom
  elements live. Porting those as iframe evaluates would have been wrong in a
  way that still half-works. The one place upstream really does reach inside
  (`cy.get("iframe").its("0.contentWindow")`, handleLink) is ported through a
  real `Frame` handle, since `FrameLocator` deliberately has no `evaluate`.
- **`onVisitPage(win)` → `insertHtml.afterEmbed` script**, which runs right
  after the custom elements are parsed. Its in-callback
  `expect(attrValue).to.not.equal("true")` is recorded on `window` and asserted
  in the test body, per PORTING's "callback-scoped assertions don't enforce"
  rule — a listener that never runs must fail loudly.
- Upstream pins the dashboard iframe with `selector: '[dashboard-id="…"] > iframe'`
  in the 4-element analytics test. The harness's accessor is index-based and the
  dashboard element is first — provably the same element.

---

## Three-line summary

`page.clock` **does** install into the embed iframe — measured inside the frame
(Playwright's `setTimeout` stub; `Date.now()` advancing by exactly `runFor`) —
so the block where upstream explicitly gave up on `cy.clock()` and used real
timeouts is now deterministic, with real time frozen and a 30× wider negative
window; the reusable catch is that you must **step** the clock at the app
timer's own period, because a single large `runFor` coalesces ticks and silently
produces zero refreshes. Two further `chromeWebSecurity: false` blockers surfaced
(cross-origin `/auth/sso` needs `embedding-app-origins-sdk`; the `http://`
mock JWT provider is mixed content on an https test page) — both fixed without
touching the shared harness, and both will hit any remaining Group A spec that
combines a production origin with a real auth flow. 20/20 executed and green,
40/40 under `--repeat-each=2`, tsc clean, all negative assertions
mutation-checked, and the anti-#39 two-leg slot guard passing.
