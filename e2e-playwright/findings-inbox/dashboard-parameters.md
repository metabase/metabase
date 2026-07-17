# dashboard-parameters — port findings

Source: `e2e/test/scenarios/dashboard-filters/parameters.cy.spec.js` (2,989 lines)
→ `tests/dashboard-parameters.spec.ts`. New helpers: `support/dashboard-parameters.ts`.

**Source-path correction**: the handoff brief named
`e2e/test/scenarios/dashboard-filters/dashboard-parameters.cy.spec.js`. No such
file exists. The real source is `parameters.cy.spec.js` in that directory (the
port's own header had it right). Worth noting because PORTED.txt entries are
keyed on the source path.

## VERDICT on the suspected field-61 / empty-options product bug: **port artifact, not a product bug**

Status of the inherited claim: RESUME.md open-thread #2 recorded that an agent
"observed `query_metadata` containing field 61 while the parameter's value
options came back EMPTY" and died before cross-checking. The claim was never
written into the spec — no `test.fixme`, no comment, no note. It existed only in
the handoff prose, so it had to be rediscovered from scratch.

**Field 61 = `PRODUCTS.CATEGORY`** (`e2e/support/cypress_sample_database.json:81`).
That identifies the candidate tests: the ones mapping a parameter to that field.

Evidence against the bug:

1. **The value-options path works on a fresh backend.** "should handle multiple
   filters …(#13150/#15689/#15695/#16103/#17139)" is the test that maps a
   dashboard parameter to `PRODUCTS.CATEGORY` and asserts the dropdown lists
   `Widget`/`Gizmo`/`Doohickey`/`Gadget` from
   `GET /api/dashboard/:id/params/:param/values`. It **passes** against a
   freshly booted slot-3 backend. Empty value options do not reproduce.
2. **`query_metadata` containing field 61 while values are empty is not a
   contradiction in the first place.** They are different endpoints backed by
   different data: `query_metadata` reports the *fields the dashboard
   references*, while `params/:id/values` serves the *cached field values*
   (`metabase_fieldvalues`). One being populated says nothing about the other.
   Per the post-#24 corollary now in PORTING.md: an odd-looking API response is
   not a bug until you can name the user-visible breakage. Nobody ever named one
   here — no assertion in either spec observes `query_metadata`.
3. **The prior backend was stale.** The slot-3 JVM was 89 minutes old when I
   took over, and PORTING.md documents twice that long-lived `--hot` backends
   and kept slot backends degrade. This is the same failure mode that produced
   the retracted FINDINGS #24.

**Confidence: high that there is no product bug here.** The one caveat below.

### The caveat — what I could not verify

I could not reproduce the agent's *observation*, only rule out the *conclusion*.
The original backend is dead, so I cannot inspect the exact response it saw or
know which test it was looking at when it saw it. My reconstruction (field 61 →
`PRODUCTS.CATEGORY` → the parameter-values tests) is inference from the one
concrete detail that survived the handoff. If the agent was looking at some
other flow, I have tested the wrong thing.

What would settle it beyond doubt: nothing available — the evidence died with
the backend. What is *checkable*, and what I did check, is that every test in
this spec that exercises field 61's value options passes on a fresh backend, and
that the original Cypress spec agrees (below). That is the useful claim; the
inherited one is not recoverable and should be closed, not carried forward.

**Do not report the field-61 observation as a migration dividend.**
</content>
</invoke>
