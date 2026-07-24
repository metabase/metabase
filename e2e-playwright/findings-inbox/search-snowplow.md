# search-snowplow (slot 1)

Source: `e2e/test/scenarios/search/search-snowplow.cy.spec.js` (674 lines, 29 `it`s)
Target: `e2e-playwright/tests/search-snowplow.spec.ts` + `support/search-snowplow.ts`
Result: **29/29 passed on the jar** — 1:1 with upstream, nothing dropped, merged,
skipped or fixme'd. Stable under `--repeat-each=2` (58/58).
`bunx tsc --noEmit` clean.

---

## 1. Dividend: PORTING rule 6 is wrong for snowplow-*subject* specs — and we don't need micro

Rule 6 ("snowplow helpers → no-op stubs") is written for specs where snowplow is
incidental. Applied here it would have produced 26 no-op tests. It also isn't
necessary: snowplow can be captured **entirely at the browser boundary**, with no
container, no shared-file edit, and no cross-slot contention (which a shared
snowplow-micro on `:9090` would have, since `resetSnowplow` wipes one global
store that five parallel agents would share).

`support/search-snowplow.ts installSnowplowCapture(page, mb.baseUrl)`:

1. `page.addInitScript` installs a setter on `window.MetabaseBootstrap` (the
   inline settings blob the backend embeds in index.html and that
   `metabase/utils/settings.ts` clones at module init), forcing
   `snowplow-enabled` / `anon-tracking-enabled` true and `snowplow-url` to the
   app's **own origin**. `/api/session/properties` is routed and patched the
   same way, because `trackSchemaEvent` re-reads `Settings.snowplowEnabled()`
   per event and a later site-settings refresh would otherwise restore the
   backend value.
2. `page.route` catches the tracker's POST to
   `/com.snowplowanalytics.snowplow/tp2`, base64url-decodes `ue_px` (or reads
   `ue_pr`), and records `data.data` — byte-identical to what micro exposes at
   `event.unstruct_event.data.data`, which is exactly what
   `H.expectUnstructuredSnowplowEvent` matches on.

**Why the app's own origin matters (new gotcha, generalisable):** the snowplow
browser tracker POSTs `application/json` **plus an `SP-Anonymous` header**
(`anonymousTracking: { withServerAnonymisation: true }` in
`frontend/src/metabase/analytics/snowplow.ts`), so any cross-origin collector
triggers a CORS **preflight** — and Playwright does not intercept preflight
`OPTIONS`. The preflight fails against a dead collector, so the real POST is
never sent and `page.on("request")` never sees a body. Pointing the collector at
the app origin removes CORS entirely. **Any port that wants to observe a POST
body to a third-party origin has this problem**; re-pointing the client at the
app origin is the cheap fix.

**Environment note worth recording:** the defaults differ by artifact.
`snowplow-available` defaults to `config/is-prod?` → **true on the jar**, false in
source mode; `snowplow-url` defaults to **`https://sp.metabase.com` on the jar**
and `http://localhost:9090` in dev. So without the client-side override a jar-mode
port would be firing real analytics at Metabase's production collector. The
slot-1 backend I inherited had `MB_SNOWPLOW_URL`/`MB_SNOWPLOW_AVAILABLE` **set in
its process env** by an earlier session (env beats the app DB, so the settings API
silently refuses to change them — `is_env_setting: true` in `GET /api/setting`).
I killed and rebooted it so verification ran against the CI-representative
config.

### The gap — stated explicitly
`expectNoBadSnowplowEvents` is the one thing this cannot reproduce. Upstream asks
snowplow-micro for **Iglu schema validation failures** against
`snowplow/iglu-client-embedded/schemas`. The port degrades it to a structural
check (every captured payload decoded into a well-formed self-describing event
with both schema strings present). So the port does **not** catch "the FE emits a
field the search 1-1-4 schema rejects". Closing that would mean running the
schemas through a JSON-schema validator (`ajv` is in the repo root) — a
worthwhile follow-up, deliberately out of scope here.

## 2. Dividend: a vacuous upstream assertion — `content_type: []`

`e2e-snowplow-helpers.js isArrayDeepMatch` iterates only the **expected** array's
indices, so `[]` deep-matches **any** array. In the type-filter "removed from the
UI" test, upstream asserts `content_type: []` with `count: 1`. Traced:

- Event 1 (URL `type=card`) → `content_type: ["card"]` — matches `[]` vacuously.
- Event 2 (filter removed) → `content_type: **null**`, because
  `toSnowplowContentTypes(searchRequest.models)` returns `null` for
  `undefined` (`frontend/src/metabase/api/analytics.ts:88`). `Array.isArray(null)`
  is false, so it matches nothing.

Count is therefore 1 and the test is green — while asserting nothing about the
event it was written for. Ported as `content_type: null` (a real assertion,
verified passing), and the port's `isDeepMatch` compares arrays by **length +
element-wise** so the remaining three `content_type` assertions can't go vacuous
the same way. Deviation documented in the helper's docstring.

## 3. New PORTING.md gotcha: `pressSequentially`/`fill` focus but never CLICK

`cy.type()` clicks the subject first; `locator.pressSequentially()` only calls
`focus()`. `SearchBar` (`frontend/src/metabase/nav/components/search/SearchBar/SearchBar.tsx`)
renders its results dropdown off `isActive`, which is set by the **container's
`onClick`** — not by focus. So typing into it produced a fully populated,
focused input, a plausible-looking page snapshot, and **no `/api/search` request
at all**. The failure surfaced 15s later as "0 snowplow events", nowhere near the
cause. Rule: when a widget's open/active state is driven by `onClick` rather than
`onFocus`, `click()` before `pressSequentially()`. (Rule 5 currently only says
"click to focus, then type" for CodeMirror; this is the same rule and it
generalises.)

## 4. New PORTING.md gotcha: `locator.count()` does not retry

`cy.findAllByTestId(x).each(...)` retries until at least one element exists;
`await locator.count()` is a one-shot read. The type-filter popover renders a
loader until its own `available-models` search resolves, so `count()` returned
**0**, the click loop ticked zero times, Apply became a no-op, and — because no
click ever *failed* — the test died on a downstream event assertion with no hint
of where. Gate with `await expect(locator.first()).toBeVisible()` before
`count()`. Same shape as the "anchor on the response that populates the list"
rule, but the fingerprint is different: nothing times out at the loop.

## 5. Consolidation debt

- `commandPaletteSearch` is now re-implemented a **fifth** time
  (`search-pagination.ts`, `metrics-search.ts`, `dashboard-questions.ts`,
  `search-filters.ts`-adjacent, and now `search-snowplow.ts`). Every copy is the
  same body; the only real difference is that upstream's `viewAll` parameter was
  hardcoded `true` in all prior ports, which is why this spec needed its own. The
  fix is one shared `commandPaletteSearch(page, query, viewAll = true)` in
  `support/command-palette.ts` — a shape Cypress already has, so it passes the
  "only consolidate toward a shape Cypress already has" test.
- The **snowplow no-op stub block** (already flagged as copy-pasted across
  `homepage.ts`, `datamodel-segments.ts`, `segments-data-studio.ts`) should be
  replaced by, or at least live next to, the real capture in
  `search-snowplow.ts` — rename it to `support/snowplow.ts` at consolidation.
  Specs that only need "don't blow up" keep the stubs; specs that assert events
  get the real thing.

## 6. No product-bug claims

None. Nothing here needed a Cypress cross-check or a fixme — both failures in the
first run were port drift (items 3 and 4), which is exactly the strong prior.
Verified on the CI uberjar (`target/uberjar/metabase.jar`, COMMIT-ID 751c2a98)
only; not run in source mode, not run under CI's 2-worker matrix.
