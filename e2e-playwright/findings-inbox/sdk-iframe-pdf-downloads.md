# sdk-iframe-pdf-downloads — findings

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/sdk-pdf-downloads.cy.spec.ts` (94 lines, 2 tests).
Slot 4 (:4104), jar mode (`version.hash` `751c2a9` == `COMMIT-ID` `751c2a98`).

**Result: 2/2 executed green (first run, no fixes needed), 4/4 under
`--repeat-each=2`. No product-bug claims.**

## CAPABILITY WIN: `installSnowplowCapture` works INSIDE the embed iframe, unchanged

This is the generalisable result of the batch and it is worth propagating.

PORTING rule 6 would have this spec's snowplow helpers stubbed to no-ops — but
test 1 is literally named "with analytics tracking", so the event **is** the
subject and a stub ports it as a no-op. The rule's own escape hatch (capture at
the browser boundary) turns out to apply here even though the tracked event
fires from inside the **embed iframe**, not the customer page:

- `page.addInitScript` (which forces `snowplow-enabled` / `snowplow-url` onto
  `window.MetabaseBootstrap`) runs in **every frame**, including the embed's.
- Both `page.route` handlers (`/api/session/properties`, and the collector at
  `/com.snowplowanalytics.snowplow/tp2`) intercept requests from every frame.

So `support/search-snowplow.ts` was imported read-only and needed **zero**
changes. Proven, not assumed — the captured payload was printed:

```json
[{"event":"dashboard_pdf_exported","dashboard_id":10,"dashboard_accessed_via":"sdk-embed"}]
```

Exactly one event, with the `sdk-embed` access-via value that is the point of
the assertion. **Implication for the rest of the tier:** any remaining
sdk-iframe spec whose snowplow events are the subject can use the same capture
rather than stubbing. Previously we only knew it worked on ordinary in-app pages.

Ordering constraint held (the brief's warning): nothing in this spec routes
`/api/session/properties` after `installSnowplowCapture`, and
`prepareSdkIframeEmbedTest` performs no navigation — it is API calls plus
`page.route` — so installing it in the outer `beforeEach`, where upstream calls
`H.resetSnowplow()`, is both faithful and safe.

## Recorded gap (inherited, not new)

`expectNoBadSnowplowEvents` is the structural stand-in documented in
`support/search-snowplow.ts`: without snowplow-micro there is no Iglu schema
validation, only "every captured payload decoded to a well-formed
self-describing event". Same gap the search-snowplow port already recorded.

## Other port notes

- `cy.verifyDownload("Orders in a dashboard.pdf")` → the download is allowed to
  complete and `suggestedFilename()` is asserted **exactly**
  (`toBe("Orders in a dashboard.pdf")`). Deliberately not `download.url()`: the
  FE renders the PDF client-side and hands the browser a `blob:` URL, so a URL
  assertion could never pass (PORTING's `download.url()` gotcha).
- `cy.wait("@getDashCardQuery")` = `POST /api/dashboard/**​/query`; armed before
  the load, awaited after.
- Upstream's `setup()` takes `Partial<BaseEmbedTestPageOptions>` and spreads it
  **after** the default element list, so test 2's `elements` override replaces
  the default. Preserved exactly — this is why test 2 still gets the full
  "dashboard loaded fine" gate.
- `frame.should("contain", "Orders in a dashboard").findByLabelText(...)` —
  `.should()` yields its subject unchanged, so the `findByLabelText` is scoped
  to the frame, not to the matched text. Ported as two independent assertions
  on the frame.
- `H.assertTableRowsCount(2000)` + the two title assertions are exactly
  `assertOrdersDashboardVisible` in `support/sdk-iframe-embedding.ts`; imported
  read-only rather than re-declared.
- Test 2's `should("not.exist")` → `toHaveCount(0)`. Non-vacuous by
  construction: `setup()` has already asserted the title, the card title and
  2000 rendered rows before the absence check runs.
- `cy.deleteDownloadsFolder()` dropped (per-test temp download dir).

## Mutation results (2 run, both killed)

1. **Test 2's `withDownloads: false` → `true`** → red,
   `toHaveCount(0)` got `unexpected value "1"`. Proves the absence assertion
   resolves the right element and discriminates on the attribute.
2. **Targeted at the snowplow assertion**, since no input mutation reaches it
   without also killing the download: matcher
   `dashboard_accessed_via: "sdk-embed"` → `"static-embed"` → red. Combined with
   the printed capture above, this proves the assertion matches a real captured
   event on a real field value, and is not passing because the matcher is
   trivially satisfied.
