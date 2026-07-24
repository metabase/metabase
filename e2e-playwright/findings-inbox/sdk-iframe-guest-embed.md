# sdk-iframe-guest-embed — findings

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/guest-embed.cy.spec.ts` (120 lines, 3 tests).
Slot 4 (:4104), jar mode (`version.hash` `751c2a9` == `COMMIT-ID` `751c2a98`).

**Result: 3/3 executed green, 6/6 under `--repeat-each=2`. No product-bug claims.**

## Shared harness untouched (eleventh Group A spec in a row)

`support/sdk-iframe.ts` and `support/sdk-iframe-guest-token-refresh.ts`
(`prepareGuestEmbedSdkIframeEmbedTest`, `signGuestJwt`) were both consumed
read-only and needed no change. New companion module
`support/sdk-iframe-guest-embed.ts` holds only the two things neither covers:
the question fixture, and a frame-scoped `downloadAndAssert`.

## Fidelity notes

- **`embedding_type: "guest-embed"` is dropped from the question fixture** —
  the shared-factory rule, second confirmed instance. Upstream's `question()`
  (`e2e/support/helpers/api/createQuestion.ts:119`) destructures the fields it
  POSTs and `embedding_type` is **not among them**, even though the
  `QuestionDetails` type declares it (line 48). It is silently discarded; the
  card upstream creates carries only `enable_embedding: true`, applied by the
  follow-up PUT. `factories.createQuestion` spreads unknown keys straight into
  `POST /api/card`, so forwarding it would have made our fixture stronger than
  the original. Guest embedding works fine without it.
- `getSignedJwtForResource({ resourceId, resourceType: "question" })` →
  `signGuestJwt({ questionId, expirationSeconds: 600 })`. Identical payload
  (`{ resource: { question: id }, params: {}, iat, exp }`) and expiry; the
  shared signer already stamps `iat` explicitly.
- `cy.wait("@getCardQuery")` — the alias lives in upstream's prepare helper
  (`GET /api/embed/card/*​/query*`). Armed before the load, awaited after.
- **`MB_EDITION` fixed to "ee".** Upstream derives the describe title and an
  `@OSS` tag from `Cypress.expose("IS_ENTERPRISE")`. The spike backend is
  always the EE jar, so only the `ee` arm is reachable — same reasoning the
  landed `prepareGuestEmbedSdkIframeEmbedTest` already applies to
  `activateToken`. **This is a coverage gap, not a translation:** the `oss`
  arm of this describe is not exercised anywhere in the port.

## Strengthened vs upstream (FINDINGS #4 class)

`H.downloadAndAssert`'s GET/embed branch only watches the request go past and
asserts `statusCode === 200`. `downloadEmbedCsvFromFrame` lets the download
COMPLETE and parses the saved file. The real CSV was confirmed to be the
question's actual result — header plus exactly 2 rows (the fixture's `limit: 2`):

```
["﻿Product ID,Max of Quantity", "<row>", "<row>"]
```

No 302 was involved on this endpoint; the GET answered 200 directly, so the
"capture the initial request and let the browser follow" workaround the brief
flagged was **not needed here**. Recorded because it was a foreseen blocker that
did not materialise.

## Mutation results (5 run, all killed)

Input inversions:
1. **`expirationSeconds: 600` → `-600`** (expired guest token) → red, the
   `@getCardQuery` wait times out. The token is genuinely validated.
2. **`"with-downloads": true` → `false`** → red, the "Download results" button
   never appears.
3. **`metabase-browser` → `metabase-question`** (a component that DOES support
   guest embeds) → red, the "does not support guest embeds" error never renders.
   Proves the error is component-specific rather than a generic guest failure.

Targeted, because 1 and 2 kill before the assertions they precede:

4. **Fixture breakout `ORDERS.PRODUCT_ID` → `ORDERS.USER_ID`** → red at
   `getByText("Product ID")`. Proves test 1's column assertions read the real
   result, not chrome.
5. **CSV expected line count 3 → 4** → red, `Received array:
   ["﻿User ID,Max of Quantity", "1,7", "3,7"]` (run against mutation 4's
   fixture). Proves the parsed body is the actual export.

Test 3 correctly stayed **green** under mutations 4 and 5 — it does not use the
question fixture. A useful negative control on the mutation runs themselves.
