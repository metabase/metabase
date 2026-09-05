# admin-settings (e2e/test/scenarios/admin-2/settings.cy.spec.js → tests/admin-settings.spec.ts)

Slot 1 (:4101), jar `751c2a98` (verified: `version.hash` = `751c2a9`, `ps` shows
`java -jar target/uberjar/metabase.jar`). 1287 lines → 38 upstream tests + 1
split-out `test.fixme` = 39.

## Infra tier — email (maildev) + webhook-tester. NOT QA-DB.

Determined from the source, not assumed:

- `@external` on *"should send a test email for a valid SMTP configuration"* →
  **maildev** (SMTP :1025, web API :1080).
- `@external` on the whole `notifications` describe → **webhook-tester**
  (`tarampampam/webhook-tester:1.1.0` on :9080, fixed session id) — the Cypress
  spec says so in a comment above the describe.
- Nothing here restores a `*-writable` snapshot or touches an external SQL
  container. `PW_QA_DB_ENABLED` is **irrelevant** to this spec; it was exported
  anyway (harmless) and changes nothing.
- The map tests reach the public internet (`raw.githubusercontent.com`,
  `metabase.com`) and the slack test reaches `slack.com`, all via the backend or
  the browser. Not a container tier, but a real network dependency.

Container evidence on this box: `metabase-e2e-maildev-1` (maildev **2.2.1** —
2.x, so `isMaildevRunning()`'s `/email` probe works and nothing gate-skipped
silently) and `metabase-e2e-webhook-tester-1` both up.

**A THIRD container is required and was NOT running: `maildev-ssl`.** See below.

## Results

| run | passed | skipped | failed |
|---|---|---|---|
| full, gates ON | 37 | 2 | 0 |
| `--repeat-each=3`, gates ON | 111 | 6 | 0 |
| gate-OFF control (all three probes forced false) | 31 | 8 | 0 |

Skipped with gates ON (2): the `maildev-ssl` test and the split-out fixme.
**Everything maildev- and webhook-gated EXECUTED** — 2 email tests and 4 webhook
tests really ran against the live containers.

Gate-off control skips 8 = 2 maildev + 1 maildev-ssl + 4 webhook + 1 fixme, and
**no failures**. There is no `afterEach` in this spec, so the
"afterEach-after-skipped-beforeEach" hazard doesn't apply.

`bunx tsc --noEmit`: clean for `tests/admin-settings.spec.ts` and
`support/admin-settings.ts`. (The only errors in the tree are 4 in a sibling
agent's `tests/transforms.spec.ts` — not mine, not touched.)

## FINDING 1 — the Pro-cloud SMTP test needs a container CI has and upstream doesn't tag

*"scenarios > admin > settings > email settings > Pro-cloud instance > should be
able to save and clear email settings"* configures `localhost:465` + SSL, and
`PUT /api/ee/email/override` **live-validates the connection**
(`enterprise/.../email/api.clj:52` → `channel/email.clj check-and-update-settings`
→ `test-smtp-connection`; only `:security` is guessed, the port is not).

MEASURED without the container: `PUT /api/ee/email/override` → **400**
`{"errors":{"email-smtp-host-override":"Wrong host or port","email-smtp-port-override":"Wrong host or port"}}`,
and `custom_smtp_setup_success` never fires. `nc -z localhost 465` → closed.

The container is `maildev-ssl` in `e2e/test/scenarios/docker-compose.yml`
(maildev 2.2.1, SMTP :465, web :1081) — and it additionally needs its root CA in
the **Java keystore** (`e2e/test/scenarios/maildev-keys/README.md`). CI brings it
up (`.github/actions/e2e-prepare-containers` starts `maildev maildev-ssl` when
`maildev: true`).

**Upstream carries no `@external` tag on this test**, which is arguably wrong —
it is as container-dependent as the tagged one. Ported with an
`isMaildevSslRunning()` gate (probe `http://localhost:1081/email`), matching the
existing `isMaildevRunning` pattern. It will execute in CI.

## FINDING 2 — an upstream assertion that is false against the app, and is a RACE not a stable vacuity

*"starter instance > should not allow custom SMTP configuration"* asserts
`cy.button("Send test email").should("not.exist")`.

MEASURED: once the page paints the button **is present** ("24 × locator resolved
to 1 element"). `SendTestEmailWidget` renders on `isHosted || isEmailConfigured`
and has **no token gate**; `EmailSettingsPage` gates the surrounding block on the
same flag. This test's own intercept (upstream's, ported verbatim) sets
`email-configured? = true`, i.e. the test *creates* the condition that makes the
button render.

The important part: this is **not** a stable vacuity that can be shipped as-is.
Kept in upstream's unanchored position it passed in the normal run and **failed
in the gate-off control run**, where the preceding maildev tests skip and the
page reaches its painted state sooner. Shipping it in upstream form would have
been a flake generator that only shows up when neighbouring tests change.

So it is **split into its own `test.fixme`** rather than dropped or silently
weakened. The other four assertions of that test stay active, and the two SMTP
card absences are additionally **re-asserted after a paint anchor** (strictly
stronger than upstream).

Two readings, not distinguished here: either the starter tier should hide the
button (a product regression upstream's racy assertion cannot catch), or the
assertion has been wrong since the widget's render condition changed. **Needs a
product decision — this is the one item in this port that wants a human.**

Meta-point worth keeping: *the gate-off control is what caught this.* The normal
run was green.

## FINDING 3 — "should hide the store link when running Metabase EE" was vacuous

Upstream:
`cy.findByTestId("admin-layout-content").findByLabelText("store icon").should("not.exist")`.
`StoreLink` renders in `AdminNavbar`, **never inside `admin-layout-content`**.

MEASURED on `/admin/settings/license` (jar 751c2a98):

| | content | navbar | page-wide |
|---|---|---|---|
| no token | 0 | 1 | 2 |
| `pro-self-hosted` | 0 | 0 | 1 |

(the residual page-wide icon is the License item in the settings sidebar.)

So the upstream check cannot fail in either direction. The behaviour it *meant*
to assert is real, and its OSS twin already scopes to `getByLabel("Navigation
bar")` — so the port keeps upstream's assertion **and adds** the navbar-scoped
one. Mutation-verified: dropping the token **survived** before and **kills** the
test now.

## FINDING 4 — `MB_SITE_URL` (#39) defeats three tests; shimmed rather than fixme'd

On a slot backend `site-url` reports `is_env_setting: true`, so `SiteUrlWidget`
renders `SetByEnvVar` and **has no input at all**. Three tests drive that widget
(#4506, and both https-redirect tests).

`unpinSiteUrl` (support/admin-settings.ts) removes *only the harness override*
on the client: flips `is_env_setting` back to false in `GET /api/setting`, and
echoes successful writes through `GET /api/session/properties` (which is where
`useAdminSetting(...).value` and therefore `HttpsOnlyWidget`'s `isHttps` come
from). `PUT /api/setting/site-url` is passed through to the **real** backend —
verified by curl that an invalid URL still 500s from
`metabase.system.settings/normalize-site-url` even when the setting is env-set.

Note for anyone reusing this: patching only `is_env_setting` is **not enough**
for the https tests. The widget's *value* comes from session properties, and the
env value wins there after the write, so the site-url never reads as https and
the redirect widget never mounts. Both halves are needed.

All three tests are load-bearing under mutation (M2, M2b, M4, M5 below).

## FINDING 5 — a page-wide `findByDisplayValue` resolves a stale INDEX

`findByDisplayValue(page.locator("body"), …)` returns `input,textarea,select`
**nth(i)**. The localization page re-renders as settings land, so the index goes
stale: measured once in a `--repeat-each=3` run as a 30s click timeout on
`<input type="hidden" value="MMMM D, YYYY">` — a *different* widget's hidden
Mantine value input, for a query that asked for `"US Dollar"`.

Same family as PORTING's "a list that re-renders under a resolved locator clicks
the wrong row", but it bites the **shared** `filters-repros.findByDisplayValue`
helper, which several landed ports call page-wide. Fix here: scope to the
widget's own testid (`currency-formatting-setting`, `site-url-setting`) — the
same single element Cypress resolved. 5/5 green after.

**Worth a sweep:** any landed port calling `findByDisplayValue` with a page-wide
scope on a page that re-renders has this latent flake.

## Mutation testing — 21 mutants, 20 killed

Inputs inverted, never expectations. Kill site recorded for each.

| mutant | verdict | died at |
|---|---|---|
| M1 cloud upsell: activate `pro-cloud` (hosting=true) | KILLED | upsell card |
| M2 #4506: type a *valid* `/` instead of `foo` | KILLED | `status === 500` |
| M2b #4506 **tail**: real 500 + real cause, different `message` | KILLED | the toast text (tail) |
| M3 save-a-setting **tail**: swallow the PUT (204, no persist) | KILLED | post-reload `toHaveValue` (tail) |
| M4 https redirect: `/api/health` → 500 | KILLED | "Redirect to HTTPS" |
| M5 https failure: `/api/health` → 200 | KILLED | error text |
| M6 date formats: pick a different date style | KILLED | first display-value check |
| M6b date formats **tail**: 2nd half opens Products not Orders | KILLED | `2028/2/11, 9:40 PM` (tail) |
| M7 currency unit **tail**: "In the column heading" | KILLED | `$39.72` (tail) |
| M8 timezone **tail**: select US/Alaska | KILLED | `toHaveValue("US/Central")` (tail) |
| M9 EE store link: drop the token | **SURVIVED → fixed → KILLED** | see Finding 3 |
| M10 starter: `pro-self-hosted` instead of `starter` | KILLED | self-hosted card absence |
| M11 license input: drop `hosting` from the billing stub | KILLED | `license-input` absence |
| M12 #13604 **tail**: widen filter to include Sunday | KILLED | the *sunday* absence check (tail) |
| M13 updates: latest version older than running | KILLED | "1.56.4 is available" |
| M14 Basic Auth **tail**: wrong password | KILLED | base64 Authorization header (tail) |
| M16 custom map: load `test.geojson` (no features) | KILLED | region-key select never populates |
| M17 currency **tail**: British Pound not Euro | KILLED | `€10.00` (tail) |
| M18 self-hosted SMTP: port 1026 | KILLED | `custom_smtp_setup_success` |
| M19 date-filter widget **tail**: filter a different day | KILLED | result cells (tail) |
| M20 #14900: stub `is_env_setting: false` | **SURVIVED** | — |

Ten of these were aimed specifically at tail assertions, and all ten died at the
tail rather than the first assertion.

**M20, the remaining survivor — bad mutation / weak upstream test, not port
drift.** `'General' admin settings should handle setup via MB_SITE_URL` asserts
only that the page renders (no error boundary, "Site name" / "Site URL" labels
present). Both labels render whether or not `site-url` is env-set, so no
assertion in that test discriminates the condition in its own title. Left 1:1
with a comment rather than invented into something stronger. Mildly in the
port's favour: on a slot backend `site-url` **is** genuinely env-set, so the real
condition is exercised even without the stub.

## Snowplow

Captured at the browser boundary (`installSnowplowCapture`), not stubbed — three
describes have snowplow as their *subject* (`upsell_viewed`,
`custom_smtp_setup_clicked`/`_success` ×2). Rule 6's no-op stub would have made
those assertions no-ops. `expectNoBadSnowplowEvents` is the documented structural
stand-in and does **not** reproduce micro's Iglu schema validation.

M18 confirms the SMTP snowplow assertions are load-bearing (the mutant died
*at* `custom_smtp_setup_success`).

## Notes / caveats

- **No Cypress cross-check was run** — sibling slots were live and `H.restore()`
  would re-point database 1 at the shared H2 file. Every claim above rests on
  measurement against the jar, not on cross-harness agreement.
- Date/number strings baked into the localization tests (`2028/2/11, 21:40`,
  `April 28, 2025`, `127.52`) are sample-data-derived and can drift between the
  stale local jar and CI's merge-commit jar. Ported verbatim; a CI-only failure
  on one of those is data drift, not port drift.
- The `notifications` describe drives a **globally shared** webhook-tester
  session id (`00000000-…`). Concurrent slots running this spec would trample
  each other. Not an issue today (only this port uses it), but it is not
  parallel-safe by construction.
- `support/INDEX.md` was **not** regenerated (the brief forbids touching
  `build-helper-index.mjs`, and INDEX.md is shared with live siblings).
  `support/admin-settings.ts` therefore isn't in the index yet.
- PORTED.txt / QUEUE.md untouched, per brief. Nothing committed.
