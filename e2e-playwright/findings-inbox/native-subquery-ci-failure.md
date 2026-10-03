# native-subquery CI failure — port bug, and a retraction of FINDINGS #24

## The CI failure (fixed)

`native-subquery.spec.ts` "autocomplete should work for columns from referenced
questions" failed deterministically on CI run 29569211972 (both matrix legs,
retries included) at `visitQuestion(page, questionId3)`, timing out on
`POST /api/card/:id/query`.

**Root cause — port bug, not an app bug.** The card is created through the API
with a hand-written card tag whose name carries no slug (`{{#5}}`, tag
`name: "#5"`). On load, `initializeQB > updateTemplateTagNames`
(`frontend/src/metabase/query_builder/actions/core/initializeQB.ts:231,448`)
fetches the referenced card and rewrites the tag into the query text
(`{{#5}}` → `{{#5-a-people-question-1}}`, `NativeQuery.ts:60`). Only `question`
gets the rewrite; `originalCard` keeps the pristine stored query
(`initializeQB.ts:143`). So the freshly-loaded saved question is already dirty:

```
isQueryDirty = !Lib.areLegacyQueriesEqual(question.datasetQuery(), originalQuestion.datasetQuery())  // true
canUseCardApiEndpoint = !isDirty && question.isSaved()                                               // false
```

(`frontend/src/metabase/querying/run-query.ts:191`,
`query_builder/actions/querying.ts:145`) — and the QB runs it through
`POST /api/dataset`. The saved-card endpoint `visitQuestion` waits for never
fires. The question also renders with a live **Save** button, visible in the CI
failure's page snapshot — the tell that it loaded dirty.

The **Cypress original uses a bare `cy.visit`** and never waits on the query, so
only the port is exposed to the endpoint choice. This is the mirror image of the
already-documented gotcha ("saved native questions run via /api/card/:id/query,
ad-hoc via /api/dataset"): there the *ad-hoc* wait never resolved, here the
*saved* one doesn't.

**Fix**: `visitQuestionEitherEndpoint` in `support/native-extras.ts` — same load
barrier (query_metadata + query), but satisfied by either endpoint, so it does
not assert which one runs. Applied to the two visits of cards whose tags are
stored unslugged.

Sibling test "typing a card tag should open the data reference" passes only by
luck: its card is stored with **no template-tags at all**, so nothing is
rewritten and it stays clean.

## Retraction: FINDINGS #24 does not reproduce against the CI uberjar

FINDINGS #24 records "two more real app bugs — an MBQL5 load-path template-tag
cluster", both said to be reproduced by the Cypress originals. **Neither
reproduces against the CI EE uberjar** (run 29569211972's own artifact, slot
backend, jar mode):

- **#24(a)** "card-reference tags are no longer rewritten on question load;
  `GET /api/card/:id` never fires from `updateTemplateTagNames`" — **false here**.
  Instrumented request log for a `/question/:id` load shows `GET /api/card/98`
  firing, and the resulting URL hash carries the rewritten query
  (`select COUNT(*) from {{#98-a-people-question-1}}`, tag renamed and
  `display-name: "#98 A People Question 1"`). With the visit helper fixed, the
  `test.fixme`'d test "card reference tags should update when the name of the
  card changes" **passes end-to-end**, 3/3 runs. It is enabled again in this PR.
- **#24(b)** the two `native-snippet-tags` "change the inner tag type"
  `test.fixme`s (snippet-inner variable tags not surfaced on saved-question
  load) — **both pass on the jar**, verified by temporarily flipping the fixmes
  (spec restored byte-identical; not modified in this PR, it is another port's
  file).

That accounts for the reported failures without any app bug: on a backend where
the rewrite does *not* happen, the tag is never rewritten (so #24(a)'s assertion
fails) and the question is never dirty (so it runs via the saved endpoint and
`visitQuestion` works — which is exactly why this test "passes locally"). On the
jar both flip together. One difference, two opposite symptoms.

**Scope of these claims** — what is verified vs not:

- Verified: all four native-subquery tests and all six native-snippet-tags tests
  pass against the CI uberjar (slot backend, per-worker jar mode).
- Verified: the whole repo except `e2e-playwright/` is **identical** between the
  jar's build commit (`6c67bb8`) and the branch HEAD it was diagnosed on, so
  source mode at HEAD and the jar are the same FE and BE code. A behavioural
  split between them is therefore not a real code difference.
- **Not verified**: the source-mode side. I did not boot a source backend (the
  other slots were in use). The most likely explanation for the original
  diagnosis is a stale long-lived slot backend and/or a stale rspack hot bundle
  serving older FE code — a hazard PORTING.md already documents twice. That
  remains a hypothesis; the useful, checkable claim is the jar result above.

**Suggested follow-up**: re-verify #24(a)/(b) on a freshly booted source backend
before FINDINGS #24 is cited anywhere as a migration dividend, and un-fixme the
two native-snippet-tags tests if it holds. Do not report #24 as a product bug
found by porting on current evidence. FINDINGS #2/#22 (the dimension-template-tag
`parameters: []` regression) is a **separate** claim and is untouched by this —
though note the cards here also come back with `parameters: []`, so it is worth
re-checking on the jar by the same method.
