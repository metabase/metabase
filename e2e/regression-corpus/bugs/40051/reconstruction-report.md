# Reconstruction report — metabase#40051 (FE)

_Verbatim report (a34349a95245ef4f1)._

---

Tree is clean. My investigation is complete. Here is the report.

## reconstruction_failed

**category: `no_unit_oracle__real_oracle_cypress`**

### 1. What the fix actually changed (behavior vs. cosmetics)

The fix commit `d12c549a` for bug metabase#40051 ("Do not put js code into page title") has exactly **one behavioral change**, in the title-setting code. Current (fixed) `frontend/src/metabase/query_builder/actions/querying.ts:179-183`:

```ts
const getLoadingMessage = getWhiteLabeledLoadingMessageFactory(getState());
const loadingMessage = getLoadingMessage();          // call factory -> string
const title = { onceQueryIsRun: loadingMessage, ... };
dispatch(setDocumentTitle(title.onceQueryIsRun));
```

Pre-fix, the factory function was assigned directly to `title.onceQueryIsRun` (never called), so the document title rendered the **function's JS source**. That is the bug.

Everything else in the commit — `getLoadingMessage` → `getLoadingMessageFactory` across `app.js`/`whitelabel/index.js`/`plugins/index.ts`/`selectors/whitelabel/index.ts`, and the same rename in the QueryVisualization component — is a **mechanical symbol rename** to clarify that the selector returns a factory. The selector always returned a factory `(isSlow) => msg` both before and after; the component (`QueryVisualization.tsx`) always called it. No behavior changed in those files.

### 2. The two listed unit oracles are non-discriminating

In the fix diff, the edits to **both** listed specs are pure renames of the called symbol; the assertion values (`"Doing science..."`, `"Waiting for results..."`, custom-message rendering) are unchanged. Neither spec exercises `querying.ts` / `setDocumentTitle`, which is the sole behavioral site.

### 3. Empirical proof (baseline vs. faithful bug reintroduction)

- Baseline `common.unit.spec.ts` — `Tests: 10 passed`
- Baseline `QueryVisualization.unit.spec.tsx` — `Tests: 2 passed`
- I then applied the **faithful** bug reintroduction (drop the `getLoadingMessage()` call in `querying.ts` so the factory function goes into the title — literally bug #40051) and re-ran both: `Tests: 12 passed, 12 total`. **Neither spec fails.** (Edit reverted; tree clean.)

### 4. The real oracle is Cypress

The fix added `e2e/test/scenarios/question/document-title.cy.spec.js` (`metabase#40051`), whose discriminating assertion is:
```js
cy.title().should("eq", "Doing science... · Metabase");
```
Pre-fix the title is the function source, so only this e2e test observes the regression.

### 5. failure_shape / confidence

- **failure_shape:** none obtainable from the provided unit oracles — a faithful revert leaves them green; the only way to make them "fail" is a forbidden `git apply -R` of a rename (or a fabricated half-rename symbol mismatch, which is a compile/import error, not this bug's behavioral regression).
- **reconstructable?** Yes, but **only against the Cypress e2e oracle**, not against either listed jest unit spec.
- **Confidence: high.** Adversarial self-check performed: I did not merely reason abstractly — I reproduced the exact bug behavior in the product and demonstrated both provided oracles stay green, and I confirmed the fix's spec edits carry no changed assertion values.

No `git diff` to report (working tree restored to HEAD).
