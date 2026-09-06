# dashboard-parameters — port findings

Source: `e2e/test/scenarios/dashboard-filters/parameters.cy.spec.js` (2,989 lines)
→ `tests/dashboard-parameters.spec.ts`. New helpers: `support/dashboard-parameters.ts`.

**Source-path correction**: the handoff brief named
`dashboard-filters/dashboard-parameters.cy.spec.js`. No such file exists — the real
source is `dashboard-filters/parameters.cy.spec.js` (the port's own header had it
right). PORTED.txt entries are keyed on source path, so this matters.

---

## VERDICT on the suspected field-61 / empty-options product bug: **NOT a product bug — local FE-build artifact**

RESUME.md open-thread #2 recorded that an agent "observed `query_metadata`
containing field 61 while the parameter's value options came back EMPTY" and died
before cross-checking. The claim was never written into the spec — no `test.fixme`,
no comment — so it had to be rediscovered from scratch.

**Field 61 = `PRODUCTS.CATEGORY`** (`e2e/support/cypress_sample_database.json:81`).
That pins it to `should handle mismatch between filter types (metabase#9299,
metabase#16181)`, the one test mapping a dashboard parameter to a *native
field-filter template tag* on that field.

### The observation is real and reproducible — it is not staleness, and not a port bug

Against a **freshly booted** slot-3 source-mode backend (I killed the 89-minute-old
JVM first, per the staleness rule):

- `GET /api/dashboard/11/query_metadata` → `fields: [61]`, `tables: ["card__98"]`.
  Field 61 **is** delivered to the browser. Confirmed by instrumenting the actual
  response the page receives, not inferred.
- The dashcard nevertheless renders the *disabled* mapper state: *"A text variable
  in this card can only be connected to a text filter with Is operator."* — i.e.
  `mappingOptions` is empty (`DashCardCardParameterMapper.tsx:85`:
  `isDisabled = mappingOptions.length === 0 || isAction`).
- So the agent's observation reproduces exactly. **Staleness did not cause it.**

The **port is faithful**: the unmodified Cypress original, run against the same
backend in the same browser, fails at the **same assertion** — `Column to filter on`
(source line 260 ≡ port line 337). See the harness caveat below; the naive
cross-check was invalid and had to be fixed first.

### But it does not reproduce on the CI uberjar — so it is not a product bug

Booted slot 3 from the CI EE uberjar of run 29569211972 (`JAR_PATH=…`, jar backend
**and** the jar's static FE assets — no rspack hot bundle):

- **The test passes.** The dashcard renders `"Column to filter on / Native Filter"`.
- The `query_metadata` payload is **identical**: `fields: [61]`,
  `tables: ["card__98"]`.

Same backend data, opposite FE behaviour. Narrowing the differing variable:

| Variable | Source mode | Jar mode | Same? |
|---|---|---|---|
| `query_metadata` payload | `fields:[61]` | `fields:[61]` | **yes** |
| `dataset_query` serialization | MBQL5: `template-tags` array, `dimension: ["field",{opts},61]` | byte-identical shape (probed with an identical card) | **yes** |
| `card.parameters` | `[]` | `[]` | **yes** |
| FE **source** | branch touches **zero** product code; only 2 unrelated FE commits on master since merge-base (transform-job header, MaybeLink) | same source | **yes** |
| FE **build artifact** | rspack hot bundle (`:8080`) | jar static assets | **NO** |

The only variable that differs is the **local rspack hot FE bundle**. Backend
responses are equivalent and the FE source is identical, so the local dev FE build
is serving behaviour its own source does not produce.

**This is the same failure mode that retracted FINDINGS #24** — and it closes the
gap the retraction explicitly left open ("Not verified: the source-mode side").
Here the source-mode side *is* pinned down: it is the FE build, not the app.

**Do not report field-61 as a migration dividend.** Close open-thread #2.

### Hypotheses I chased and killed (recorded so nobody re-chases them)

- *"Backend returns MBQL5 `["field",{opts},61]`; the FE's legacy path reads
  `dimension[1]` and gets the opts map"* — `TemplateTagDimension.field()`
  (`Dimension.ts:25`) really does read `dimension[1]`, so this looked airtight.
  **Wrong**: `templateTagsMap()` delegates to `Lib.templateTags()` (CLJS), and
  `template-tag-cljs->js` (`src/metabase/lib/js.cljs:2029`) runs
  `(m/update-existing :dimension #(some-> % ref->legacy-ref))` — the dimension is
  converted back to a legacy ref before JS sees it. This was the retracted #24's
  "MBQL5 load-path" story reappearing; it does not survive reading the code.
- *"The compiled CLJS is stale and lacks that conversion"* — **wrong**: the hot
  bundle contains `ref__GT_legacy_ref`.
- *"`card.parameters: []` is the bug (cf. FINDINGS #2/#22)"* — **not a signal on its
  own**: the jar returns `parameters: []` for the same card and the mapper works
  fine. Anything resting on `parameters: []` alone needs a different argument.

### What I did NOT verify

- **The precise mechanism.** I established *that* the local FE bundle is the
  differing variable, not *why* it diverges from its own source. `target/cljs_release`
  (21:31) is newer than `js.cljs` (Jul 13), and no product code changed in the hot
  server's 2h lifetime — so ordinary staleness does not obviously explain it. I did
  not restart the shared rspack server to confirm (other slots were mid-run on it),
  and did not diff the hot bundle against the jar's assets function-by-function.
- Whether a dev-vs-production FE build difference (rather than staleness) is
  responsible. Both are environmental; neither is a product bug.
- The jar is CI's **PR merge commit** (`COMMIT-ID` = `751c2a98`), i.e. branch merged
  into master@~Jul-17-09:13 — *not* branch HEAD, despite the artifact name carrying
  `6c67bb8`. FINDINGS #24's retraction asserts the jar's tree is "identical to branch
  HEAD"; that is looser than stated. It happens not to matter here (only 2 unrelated
  FE commits in the window), but the claim should be corrected wherever it is relied on.

---

## ⚠️ Methodology: the fidelity cross-check as written is NOT sufficient

PORTING.md's new rule says: *"Same tests fail at the same assertions → the port is
faithful and the behaviour is real. This is the strongest evidence we can produce."*

**The second clause is false, and this spec disproves it.** Cypress and Playwright
here share one backend *and one FE bundle*. A shared environmental cause makes both
harnesses fail identically while the app is fine — exactly what happened above:
identical failure in both harnesses, and the test passes on the jar.

"Same failure in both harnesses" establishes **port fidelity only**. It says nothing
about whether the behaviour is real. The decider for *real vs environmental* is a
**different artifact** — the CI uberjar — not a second harness on the same one.

### This retroactively undercuts the 6 `dashboard-filters-reproductions-1` fixmes

`findings-inbox/dashboard-filters-reproductions-1.md` justifies 6 `test.fixme`s with
"the original Cypress spec fails identically on the same backend". That is now known
to be insufficient evidence — it is the same argument this spec just falsified, and
that spec ran on the **same shared source-mode backend + rspack server** (its own
note even flags "a shared environmental cause is not excluded"). Its proposed decider
was "wait for CI's Cypress leg"; the cheaper and stronger decider is to re-run those
6 against the jar (`JAR_PATH=…`), which takes ~2 min each. **Recommend doing that
before any of them is cited as a product finding.** RESUME open-thread #3.

To make that cheap I left the CI uberjar at **`target/uberjar/metabase.jar`**
(gitignored; `COMMIT-ID` = `751c2a98`) — the path PORTING.md already documents, and
which its own TODO notes the local jar build can't produce. `21528` ("FK-remapped
field values missing from a parameter dropdown") is the one I'd check first: its
symptom is close to this spec's.

---

## New gotcha (candidate for PORTING.md): the Cypress cross-check needs the DB re-point

My first cross-check was **invalid** and would have produced a bogus finding.

Slot backends share one H2 sample-database file (`e2e/tmp/sample-database.db.mv.db`)
with every other JVM on the box, and H2 embedded lets exactly one hold it. The
Playwright harness silently works around this: `mb.restore()` re-points database 1 at
the slot's **private** copy (`support/fixtures.ts:104-116`). Cypress's `H.restore()`
does not, so it leaves DB 1 on the shared file another JVM owns and every sample-DB
query 500s with:

```
Database may be already in use: ".../e2e/tmp/sample-database.db.mv.db" [90020-214]
```

Symptom: Cypress fails *earlier and differently* from the port ("There was a problem
displaying this chart"), which reads as "the port drifted" when in fact the two
harnesses were pointed at different databases. Fixed with a scratch support file that
wraps `cy.H.restore` to apply the same re-point (note: `Cypress.env()` is disabled in
this repo — values must come through `Cypress.expose()`). With that in place both
harnesses agreed exactly.

**Any cross-check run without this is comparing two different backends.** Worth
folding into the harness properly if the cross-check becomes routine.

Also: pass `--browser chrome` explicitly. `mainConfig` does set
`defaultBrowser: "chrome"`, so CLI `cypress run` is Chrome already — but the runner's
programmatic `cypress.run()` path does not select one, and Electron-vs-Chromium
inside a fidelity comparison would be an engine confound. Both my cross-checks were
Chrome 150 (verified in the run banner).
</content>
</invoke>
