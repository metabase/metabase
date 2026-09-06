# Re-verification of FINDINGS #2 and #22 — both RETRACTED

**Verdict: #2 RETRACTED. #22 RETRACTED.** Neither is a product bug. Do not put
either in front of colleagues.

Done 2026-07-18, mirroring the method that retracted #24. Every claim below was
produced against the CI EE uberjar from run 29569211972 — the same artifact that
settled #24 — booted on slot 11 / :4111 in jar mode.

## The claims under test

- **#2**: cards created with dimension-type template tags come back with
  `parameters: []`, so `string/=` filters error at query time ("Invalid values
  provided for operator"); the Cypress original fails identically against the
  same backend.
- **#22**: `sql-field-filter`'s widget test fails identically in Cypress against
  this backend — third hit, blast radius across three specs.

## Verdict summary

| Claim | Status | What actually happens |
|---|---|---|
| `parameters: []` on dimension-tag cards | **True but not a bug** | Documented, deliberately-accommodated. FE and BE both derive from template-tags when it's empty. |
| → "so `string/=` filters error at query time" | **False** | Filters render; public query returns 202. The error exists but has a different cause and is not UI-reachable. |
| → "Cypress original fails identically" (#2) | **False** | The Cypress original never downloads; its query step passes. |
| "Cypress fails identically" (#22) | **False as evidence** | Cypress does fail — from **H2 sample-DB lock contention**, not the app. The port passes 8/8. |
| Blast radius across three specs | **Dead** | No underlying bug to have a radius. |

## 1. `parameters: []` is normal — this kills #2's stated mechanism

The Cypress helper `question()` (`e2e/support/helpers/api/createQuestion.ts:142`)
passes `parameters` **straight through** to `POST /api/card` and never derives
it. `createNativeQuestion` adds nothing. The fixtures omit `parameters`, so the
card stores `[]` *by construction* — and always has. Nothing regressed.

Both sides then derive from template-tags **on purpose**:

- FE — `frontend/src/metabase-lib/v1/parameters/utils/template-tags.ts`:
  ```js
  export function getParametersFromCard(card, metadata) {
    if (card.parameters && !_.isEmpty(card.parameters)) { return card.parameters; }
    return getTemplateTagParametersFromCard(card, metadata);   // explicit fallback
  }
  ```
- BE — `src/metabase/queries/models/card.clj:384 template-tag-parameters`,
  docstring verbatim: *"An older style was to not include `:template-tags` onto
  cards as parameters. I think this is a mistake and they should always be
  there. **Apparently lots of e2e tests are sloppy about this so this is
  included as a convenience.**"*
- BE — `src/metabase/queries/card.clj:24`:
  `(or (seq (:parameters card)) ;; some older cards or cards in e2e just use the template tags`
  `    (card/template-tag-parameters card))`
- BE — `src/metabase/embedding_rest/api/common.clj:442,486` — same fallback.

A `parameters: []` in a response is exactly the condition the code is written to
handle. It is not a contract violation.

## 2. The filters render and the query succeeds (#2's user-visible claim)

With the fixme lifted, `public-question.spec.ts` "adds filters to url…" passes
**everything** through `await publicQuery`:

- `toHaveURL(/source=Affiliate/)` and `toHaveURL(/birthdate=past30years/)` ✅
- filter widget shows "Previous 30 years" ✅ and "Affiliate" ✅ ← parameters *were* derived
- `GET /api/public/card/:uuid/query` → **202** ✅ ← no operator error

It fails only at the **download**, 40 lines later. Also: the sibling fixme
"should allow to set locale…" **passes** — and its fixture is a `text` tag with
no `dimension` at all, so the "same dimension-template-tag regression" label was
never even applicable to it. Both were mislabelled.

## 3. Where "Invalid values provided for operator" really comes from

`verify-type-and-arity` (`src/metabase/query_processor/parameters/operators.clj:54`)
throws when a **variadic** operator gets a non-sequential value. The fixture's
`source` tag is `"widget-type": "string/="` (variadic) with `default: "Affiliate"`
— a **bare string**. Measured on the jar:

| request | result |
|---|---|
| `GET /api/public/card/:uuid/query` (no params → server applies default) | **400** `Invalid values provided for operator: :string/=` |
| `…/query/xlsx`, `…/query/csv` (no params) | **400** same |
| `GET …/query` with FE-shaped `value: ["Affiliate"]` | **202** ✅ |
| `…/query/xlsx` with FE-shaped params | **200** `…spreadsheetml.sheet` ✅ |
| `…/query/csv` with FE-shaped params | **200** `text/csv` ✅ |
| `GET …/query` with bare `value: "Affiliate"` | **400** same error |

So #2 did observe a real error *string* — but the cause is the fixture's
bare-string default on a variadic operator, **not** `parameters: []`, and the
browser never hits it because the FE normalises the default to `["Affiliate"]`
before sending (confirmed in an instrumented page trace).

Whether the **server-default path** ought to normalise a bare-string default is
a separate, **unverified** question. It is a candidate finding, not a finding:
it needs an upstream/master comparison to show it ever behaved differently, and
a user-reachable route. I did neither. Do not report it.

## 4. Why Cypress "fails identically" — H2 sample-DB lock contention (#22)

Cypress original, Chrome 150 headless, `MB_JETTY_PORT=4111`, no :4000 contact:
**5 passing / 3 failing**. Playwright port on the **same backend**: **8/8**, and
the named test **3/3** under `--repeat-each=3`. They disagree — the opposite of
the claim.

The Cypress failure is `POST 500 /api/card/:id/query`, and the 500 is:

```
Database may be already in use: ".../e2e/tmp/sample-database.db.mv.db".
Possible solutions: close all other connection(s); use the server mode [90020-214]
```

Mechanism, documented in **our own harness** — `support/fixtures.ts` restore():

```js
if (this.sampleDbUrl) {
  // Snapshots pin database 1 to the shared e2e/tmp H2 file, which only
  // one JVM can hold — re-point it at this worker's private copy.
  await adminApi.put("/api/database/1", { details: { db: this.sampleDbUrl } });
}
```

- `POST /api/testing/restore/default` **reverts** `database 1` `details.db` to
  the snapshot's shared path `file:<repo>/e2e/tmp/sample-database.db` (verified).
- The Playwright harness re-points to a per-worker private copy after **every**
  restore. **Cypress has no such step** — it never needed one, one backend at a
  time.
- This box was running 8+ concurrent slot JVMs plus dev :4000; `lsof` showed
  java PID 99323 holding `e2e/tmp/sample-database.db.mv.db`.

### Controlled experiment (the decider)

Same card, same backend, same session, same moment — the **only** variable is the
repoint. Card is the #22 fixture: dimension tag, `widget-type: "category"`,
`default: ["Doohickey"]`, `parameters: []`.

| arm | sample DB | `POST /api/card/:id/query` |
|---|---|---|
| **[A]** no repoint (= what Cypress sees) | shared `e2e/tmp` file | **500**, status `failed`, row_count 0, `Database may be already in use` |
| **[B]** with repoint (= what Playwright sees) | slot-11 private copy | **202**, status `completed`, **row_count 42** |

42 rows is exactly what the test asserts ("Showing 42 rows"). `parameters: []` is
present in **both** arms. It is causally irrelevant.

Corroborating tell: 2 of the 3 Cypress failures were the "field alias" tests,
which are **not part of #22's claim at all** — a broad environmental failure, not
a dimension-tag-specific bug.

## 5. The one remaining red test is ours, twice over

`public-question.spec.ts` "adds filters to url…" stays `test.fixme`, with the
reason corrected in-spec. Instrumented network trace:

```
>>REQ GET :4111/api/public/card/<uuid>/query?parameters=[{"value":"past30years"},{"value":["Affiliate"]}]
<<RES 202                                   ← query succeeds; FE normalised the default
>> click download
>>REQ GET :4111/public/question/<uuid>.xlsx?parameters=...
<<RES 302                                   ← redirect to site-url
>>REQ GET :4000/api/public/card/<uuid>/query/xlsx?...    ← THE DEV BACKEND
<<RES 404 "Not found."                      ← no download event → 30s timeout
```

`GET /api/setting/site-url` on the slot backend = `"http://localhost:4000"`
(snapshot-pinned; the sample DB is re-pointed per slot, site-url is not). This is
the FINDINGS #18 hazard ("a site-url coupling … only shows up with more than one
backend").

Proof it's not the app: adding **only**
`await mb.api.updateSetting("site-url", "http://localhost:4111")` makes the
download **fire and complete**. The test then fails on the port's own assertion:

```
expect(download.url()).toContain("/public/question/<uuid>.xlsx")
Expected substring: "/public/question/2f6aa8d4-….xlsx"
Received string:    "blob:http://localhost:4111/4a95d103-cdc4-4d40-b057-3ef323564421"
```

The FE downloads via a `blob:` URL, so that assertion can never pass. Fixes owed:
re-point `site-url` in `warmUp`/`restore` alongside the sample-DB repoint, and
assert `suggestedFilename()`/the request URL instead of `download.url()`. Zero
product bugs. (That experiment was reverted; the spec carries the explanation.)

## What changed in the tree

- `FINDINGS.md` — #2 and #22 struck through + RETRACTED with evidence; #24's
  "action owed" marked done.
- `RESUME.md` — open thread closed; threads 2 and 3 warned that the Cypress
  cross-check is invalid on a busy box (thread 3's unexplained 6 fixmes now have
  a named candidate cause).
- `PORTING.md` — four new gotchas: the cross-check quiescence rule, the
  `parameters: []` rule, the shared sample-DB/site-url pinning, `blob:` download
  URLs.
- `tests/sql-field-filter.spec.ts` — fixme **removed**, test re-enabled (8/8,
  3/3 stable), false comment deleted.
- `tests/public-question.spec.ts` — "locale" fixme **removed**, test re-enabled;
  "adds filters" stays fixme'd with the honest reason.

## Jar provenance (checked, not assumed)

Artifact `metabase-ee-6c67bb81…-uberjar` from run 29569211972 (branch
`playwright-e2e-spike`, head_sha `6c67bb8`). Downloaded fresh to
`scratchpad/ci-jar2`; **byte-identical** (sha256 `556fcbed…e5e3`) to the leftover
`scratchpad/ci-jar`, so the prior agent's jar was the right one.

The jar's `version.properties` says `hash=751c2a9`, which is **not a revision in
this repo**. That is expected — CI builds a **merge commit** of the PR head into
master. It also means the jar is *not* strictly identical to branch HEAD's
non-spike source; it may contain master commits HEAD lacks. #24's retraction
asserted the repo outside `e2e-playwright/` is "identical between the jar's build
commit and HEAD" — that is true of `6c67bb8` vs HEAD, but the *jar* is the merge,
so the identity argument is slightly weaker than stated. It does not affect these
verdicts (which rest on documented, long-standing fallbacks and a controlled
experiment, not on a source-identity argument).

## Scope caveats — what I did NOT verify

- **I did not boot a source-mode backend.** All results are jar mode on :4111.
  (Same gap as #24's retraction.)
- **I did not compare against master or upstream CI.** I did not establish when
  or whether these tests were ever green in CI, so "regression" is unfalsified
  rather than disproven. It is also unneeded: the mechanism is fully explained
  without one.
- **I did not investigate the server-default bare-string normalisation** beyond
  measuring it (§3). Candidate only.
- **The engine differs between the two harnesses** — Cypress ran Chrome 150
  headless (verified in the run log, per the mid-task correction; `cypress.run()`
  would otherwise default to Electron), Playwright ran its bundled Chromium. The
  #22 disagreement is fully explained by the sample-DB repoint (proved by the
  [A]/[B] experiment on a single backend, no browser involved), so engine is not
  load-bearing here — but it was not independently excluded for the two "field
  alias" failures, which I did not chase.
- **I did not fix the harness** (`site-url` repoint) or the port's `blob:` URL
  assertion — flagged, not fixed. No product code was touched.
- **Disclosure: port 4000 was contacted once**, by the app's own 302 to
  site-url during the instrumented download run; it returned 404. Read-only, no
  mutation, nothing created or restored there. I never targeted :4000 directly —
  but note that *any* slot-backend public-download test silently reaches for the
  dev backend.
- **The box was busy throughout** (8+ sibling slot backends). That is what
  produced the lock contention; my Playwright results are unaffected because the
  harness re-points, and the [A]/[B] experiment controls for it explicitly.

## What would change my mind

- **#22**: a run of the Cypress original on a **quiesced** box (nothing else on
  41xx or :4000, so the shared H2 file is free) that still fails "should work
  despite it not showing up in the widget type list". That would mean the lock is
  not the cause. My [A]/[B] experiment says it is.
- **#2**: any route by which a **real user** reaches "Invalid values provided for
  operator" — i.e. a UI flow where the FE sends a bare-string value for a
  variadic operator, or a public/embed link whose query runs without explicit
  parameters. I found none; the FE normalises first. Failing that, a master-vs-jar
  diff showing the server-default path used to normalise bare-string defaults
  would upgrade §3 from "fixture quirk" to a real regression — but that is a
  *different* finding from #2 and would need its own entry.
