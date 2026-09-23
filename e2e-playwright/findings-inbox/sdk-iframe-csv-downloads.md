# sdk-iframe-csv-downloads — findings

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/sdk-csv-downloads.cy.spec.ts` (115 lines, 1 test).
Slot 4 (:4104), jar mode (`version.hash` `751c2a9` == `COMMIT-ID` `751c2a98`).

**Result: 1/1 executed green (first run, no fixes needed), 2/2 under
`--repeat-each=2`. No product-bug claims.**

## Shared harness untouched; no companion module

`support/sdk-iframe.ts` consumed read-only. The three spec-local helpers
(`addGroupBy`, `addSummarize`, `setup`) stay in the spec file, which is where
upstream has them.

## Migration dividend: upstream's own CSV assertions run against the WRONG BYTES

This is the sharpest instance of FINDINGS #4 I have seen. Upstream does:

```js
cy.intercept("POST", "/api/dataset/csv", (req) => {
  req.continue((res) => {
    /* … asserts on res.body … */
    res.send({ statusCode: 200 });     // <- replaces the body
  });
}).as("csvDownload");
…
cy.verifyDownload("query_result_", { contains: true });
```

The in-flight assertions (status, content-type, `lines.length > 1`,
`parse(csvContent)`) do see the real export. But `res.send({statusCode: 200})`
then **replaces the response**, so the file `cy.verifyDownload` inspects
afterwards is Cypress's replacement, not the export — and `verifyDownload` with
`contains: true` only checks a filename substring anyway. The port completes the
real download and runs every assertion against the file the browser actually
saved.

The saved file was inspected directly to prove the strengthening is not
cosmetic — it is a genuine pivoted export, 51 lines:

```
﻿Created At: Month,0,20,40,60,80,100,120,140,Row totals
"September, 2025",1,25,26,24,16,,,,92
"November, 2025",1,50,56,25,18,,,,150
```

That is exactly what metabase#70757 regressed (blank CSVs when
`pivot_table.column_split` was not passed), so the ported assertion now actually
witnesses the fix rather than a stand-in body.

## Deliberate substitution, recorded rather than dropped

Upstream's CSV-validity check is `parse(csvContent)` from `csv-parse`, relying on
it to throw. That package is not a dependency of this spike's `package.json`.
Rather than add one or silently drop the check, validity is asserted
structurally: every record splits to the same field count (a spec-local
RFC4180-ish splitter that honours quoted commas). It is weaker than a real
parser and I am saying so.

## Other port notes

- `cy.deleteDownloadsFolder()` dropped — each Playwright test gets its own temp
  download directory.
- `cy.findByLabelText("download icon")` is the **SDK embed toolbar's** button,
  not the QB's "Download results". So `support/downloads.ts downloadAndAssert`
  is the wrong tool here twice over (wrong label, and it is `Page`-scoped while
  this popover lives inside the embed frame). Ported literally.
- `.should("have.length.at.least", 1).last()` → `expect.poll(count)` +
  `.last()`, since Playwright has no retrying length-at-least matcher.
- The three `cy.wait("@alias")`es (`/api/dataset`, `/api/dataset/pivot`,
  `/api/dataset/csv`) are each re-armed immediately before their own triggering
  action. Note `pathname === "/api/dataset"` does **not** match
  `/api/dataset/pivot`, so the two waits cannot satisfy each other.

## Mutation results (2 run, both killed)

1. **`withDownloads: true` → `false`** → red, the toolbar download button never
   appears. Proves the whole download path is reached because the attribute
   enables it.
2. **Targeted at the terminal assertions** (mutation 1 kills early): forced
   `expect(lines.length).toBeGreaterThan(100000)` → red with `Received: 51` and
   the real content printed above. Proves the file assertions execute against
   real parsed bytes and are not vacuous.
