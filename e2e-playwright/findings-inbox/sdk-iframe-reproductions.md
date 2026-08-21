# sdk-iframe-reproductions — findings

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/reproductions.cy.spec.ts` (28 lines, 1 test).
Slot 4 (:4104), jar mode (`version.hash` `751c2a9` == `target/uberjar/COMMIT-ID` `751c2a98`).

**Result: 1/1 executed green, 2/2 under `--repeat-each=2`. No dividends, no product-bug claims.**

## Nothing new was needed

`support/sdk-iframe.ts` was consumed read-only and needed no change (tenth Group A
spec in a row). `tableInteractive` came from the sibling `support/sdk-iframe-embedding.ts`;
no companion module for this spec.

## Fidelity notes

- Upstream builds its page by hand (`visitCustomHtmlPage` + `getNewEmbedScriptTag()`),
  **not** through `loadSdkIframeEmbedTestPage`. The difference is real:
  `loadSdkIframeEmbedTestPage` forces `loadType: "sync"` on the `<script>` tag,
  while the bare `getNewEmbedScriptTag()` defaults to `"defer"`. The port keeps
  the `defer` form. (No behavioural difference observed, but it is the faithful shape.)
- `H.getSimpleEmbedIframeContent()` blocks on iframe existence + non-empty body;
  the Playwright `getSimpleEmbedIframe` is a lazy `FrameLocator`, so
  `waitForSimpleEmbedIframesToLoad` restores the gate — same pattern the landed
  `metabase-browser` port uses.
- The Mantine "Add or remove columns" checkbox took a **plain `click()`** — no
  `force: true` was needed (contrast the Mantine *Switch* rule in PORTING rule 4).
  Recording this because it is the cheaper default and it worked: the checkbox
  input is not visually hidden here.

## Mutation results (inputs inverted, both killed)

1. **Removed `taxCheckbox.click()`** → red at the `not.toBeChecked()` anchor
   (24 retries against `<input checked … aria-label="Tax">`). Proves the click is
   load-bearing and the anchor is live.
2. **Retargeted the closing absence assertion at "Subtotal"** (a column that is
   still present) → red at `toHaveCount(0)`. Proves the absence locator resolves
   inside the table root and is **not vacuous** — the `toHaveCount(0)` cannot be
   passing merely because `tableInteractive(frame)` matched nothing.

Mutation 1 kills at the *first* anchor, which would leave the closing assertion
unproven; mutation 2 was added specifically to cover it (the "five siblings had
to" case in the brief).

---

## Re-verified independently (slot 4, batch owner)

The above was written by a session that was cancelled before it could be
confirmed. Every claim in it was re-run from scratch on the same jar and
**reproduced exactly**:

- 1/1 green, 2/2 under `--repeat-each=2`, and green again in the 9-test
  five-spec run.
- Mutation 1 (remove `taxCheckbox.click()`) → red at `not.toBeChecked()`.
- Mutation 2 (retarget the closing absence assertion at "Subtotal") → red at
  `toHaveCount(0)`.

The spec file needed no repair. Recorded because the *other* file the same
cancelled session left behind (`sdk-iframe-missing-tokens.spec.ts`) was badly
drifted — so "left over from a cancelled agent" was not predictive either way
here, and each file had to be judged on its own.
