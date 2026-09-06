# CI failures — run 29711801159 (commit `039f506aa24`)

Two real failures, both CI-only against the local jar, both diagnosed and fixed.
Neither is a product bug. Both are the same underlying class the file already
documents: **the artifact under test differed from the local one**, in one case
(the token) an out-of-repo *data* difference, in the other (the jar) FINDINGS #43
verbatim.

The decisive move for both was getting the *actual* CI artifacts rather than
reasoning from the local ones: the failure `error-context.md` from the
`playwright-report-s17` artifact, and the **exact uberjar CI ran**
(`metabase-ee-039f506a…-uberjar`, `COMMIT-ID e45bd0c9`).

---

## Failure 1 — `admin-tools-help.spec.ts:124`

`expect(Helping hand heading).toHaveCount(0)` → received 1, after
`activateToken("pro-self-hosted")`.

### Root cause

**FINDINGS #52's mechanism is confirmed and is not the cause of the redness.**
The inert-mock claim is exactly right, and I re-verified the chain in source:

- `enterprise/frontend/src/metabase-enterprise/support/index.ts` sets
  `PLUGIN_SUPPORT.isEnabled` inside `initializePlugin()`, gated on
  `hasPremiumFeature("support-users")`.
- `initializePlugins()` is called at **module scope** in
  `frontend/src/metabase/app.js:65`.
- `hasPremiumFeature` reads `MetabaseSettings.get("token-features")`, and
  `frontend/src/metabase/utils/settings.ts` seeds `MetabaseSettings` from
  `window.MetabaseBootstrap` — the JSON the backend inlines into `index.html`.
- `Help.tsx:136` renders the section on `PLUGIN_SUPPORT.isEnabled` alone.

So visibility is a pure function of one input — `token-features["support-users"]`
in the served bootstrap — and a `/api/session/properties` route intercept
provably cannot reach it. `mockSessionPropertiesTokenFeatures` is inert here.

**What actually reddened CI is one step further on: the staging
`pro-self-hosted` token now grants `support-users`.** The test's premise (a
hardcoded plan→feature table: "self-hosted hides it, cloud shows it") is
store-side data that lives outside this repo, and it drifted.

Evidence, measured on a slot-1 backend:

- Activating each token in turn and reading `/api/session/properties`:
  `pro-self-hosted → support-users = true` (`plan-alias: pro-self-hosted`),
  as do `starter`, `pro-cloud`, `bleeding-edge`.
- Parsing the served `#_metabaseBootstrap` JSON for `/admin/tools/help` with
  `pro-self-hosted` active: `support-users = true`. Repeated three times,
  toggling tokens between reads — stable, no lag.
- The spec then **reproduced locally**, failing at line 124 identically to CI,
  and an in-test probe of `window.MetabaseBootstrap` printed
  `default → false`, `after pro-self-hosted → true`.

Honest caveat: the *first* local run of the unmodified spec passed, before I
started probing. I did not fully explain that. `token_check.clj` caches token
status with `soft-ttl 12h / hard-ttl 36h` in a local atom validated against the
`premium_features_token_cache` table, so a warm-but-stale entry serving the
token's older feature set is the obvious candidate — I did not prove it, and I
am not claiming it. It does not affect the diagnosis: every subsequent run,
local and CI, agrees that `pro-self-hosted` grants the feature.

### Fix — option (b), the relationship assertion

Renamed to *"should display the `Helping hand` section exactly when the active
token grants support-users"*. It still drives all four token states, but for
each one reads `window.MetabaseBootstrap["token-features"]["support-users"]`
from the page — the exact input the app computed from, for that exact document
— and asserts the section renders iff it is granted.

Why this over the alternatives:

- **(a) drive the real setting** is not available. There is no
  token-features override: `src/metabase/testing_api/api.clj` has no such
  endpoint, and `token-features` is derived from the token by a live store
  check. The only lever is "activate a token", which *is* the drifting input.
- **(c) `test.fixme`** would drop a working test over a data change.
- Editing the mock is the trap #52 was written to prevent.

Not vacuous: step 1 pins a hard negative (restored snapshot, no token →
feature absent → section absent) that depends on no plan's feature list, and
the four sibling tests in the describe all require `pro-cloud` to render the
section, so a universally-false feature flag would still redden the file.

**Coverage delta, stated plainly:** we no longer assert the store's
plan→feature mapping. That was never Metabase behaviour — it is billing data —
and asserting it made an e2e test fail on a change made outside the repo.

### Verified / unproven

- Verified on the local jar (`751c2a98`) and on **CI's own jar (`e45bd0c9`)**,
  whole file, `--repeat-each=2`: 14/14 green each.
- `tsc --noEmit` clean.
- Unproven until CI runs: nothing specific — but note the test is now
  *insensitive* to which plans grant the feature, which is the point.

---

## Failure 2 — `sdk-iframe-embed-options.spec.ts:164`

`No form control with display value "Hourly" found` → 90s test timeout, in the
shared `findByDisplayValue` (`support/filters-repros.ts:246`).

### The SMTP swap is NOT the culprit — verified, not assumed

The porting agent's substitution of `configureSmtpSettings` for `H.setupSMTP()`
is fine. The CI failure snapshot shows the run got well past it: the
subscription sidebar is open, the first subscription was created, "Set up a new
schedule" was clicked, and the *second* schedule form is rendered with its
frequency control. Email was configured enough for all of that. No change made
here.

The shared `findByDisplayValue` is also not buggy — it correctly reported that
no control had that value.

### Root cause

Upstream commit **`8dd86422fec` "GDGT-2577 Replace deprecated SchedulePicker
component (#77911)"** (Sat 18 Jul, 17:23) moved the dashboard subscriptions
sidebar onto the shared `common/components/Schedule` component. That component
renders a sentence-style picker — "Sent *hourly*" — whose Mantine Select label
is lowercase (`Schedule/strings.ts:70`, `c("adverb").t\`hourly\``), with
`aria-label="Frequency"` and `data-testid="select-frequency"`. The old
`SchedulePicker` rendered "Hourly".

That commit **also updated this very Cypress spec** in the same PR:

```
- cy.findByDisplayValue("Hourly").click();
+ cy.findByTestId("select-frequency").click();
- H.popover().findByRole("option", { name: "Daily" }).click();
+ H.popover().findByRole("option", { name: "daily" }).click();
```

with the commit message explaining why: *"target Mantine Select via data-testid
… instead of findByDisplayValue (dupe visible+hidden inputs); lowercase
frequency option labels."*

Our branch does not contain `8dd86422fec` (`git merge-base --is-ancestor` →
NO), and our local verification jar `751c2a98` was built ~17h before it. CI
builds the **merge with master**, so CI's jar has it. This is FINDINGS #43's
class exactly — the local-verify jar being skewed relative to CI's.

Direct evidence, three independent confirmations:

1. CI's `error-context.md` page snapshot:
   `- textbox "Frequency" [ref=f1e464]: hourly`.
2. Probe of every control in the sidebar on the **local** jar:
   `[{INPUT text "Hourly", aria:null}, {INPUT hidden "hourly"}, 3 × switch]`.
3. Same probe on **CI's jar (`e45bd0c9`)**:
   `[{INPUT text "hourly", aria:"Frequency"}, {INPUT hidden "hourly"}, …]`
   — and the unfixed test failed there locally, identically to CI.

### Fix

Match upstream master: `sidebar.getByTestId("select-frequency").click()` and the
lowercase `"daily"` option. Dropped the now-unused `findByDisplayValue` import.
`support/filters-repros.ts` is untouched, so no other spec is affected.

No coverage is lost — this is the same interaction against the component that
replaced the old one, and it is now the *more* robust selector (a testid rather
than a display string that lives one duplicated hidden input away from
ambiguity).

### Verified / unproven

- Verified on **CI's own jar (`e45bd0c9`)**, whole file, `--repeat-each=2`:
  green both passes; and the unfixed spec fails on that jar, so the fix is
  demonstrated against the artifact that produced the failure.
- Verified the trade-off rather than assuming it: on the **stale local jar
  (`751c2a98`)** the fixed test now *fails* (`select-frequency` does not exist
  there) — the accepted, documented consequence of PORTING.md's "CI is the
  contract". Anyone re-verifying this spec locally must use a jar containing
  `8dd86422fec`.
- `tsc --noEmit` clean.

---

## What a local green does and does not prove

For failure 2, unusually, the local run **is** run against CI's exact artifact,
so it is strong: same jar, same spec, failing before and passing after. What it
still does not cover is CI's *concurrency* profile — `--workers=2
--fully-parallel` with `PW_ACTION_TIMEOUT=30000` on a contended runner. My runs
were `--workers=1` on an idle box.

For failure 1, the local green proves the assertion holds for whatever the
staging tokens grant *today*. It cannot prove CI's tokens are the same objects
(they are the `STAGING_*` secrets; I have no way to compare values), but the fix
is deliberately constructed so that it does not need to be: it reads the grant
and asserts the relationship, so it holds for any assignment.

Only a CI run proves the CI fix. Nothing here should be quoted as a product-bug
finding — both are environment/artifact differences, which is the outcome
FINDINGS #31 predicts.
