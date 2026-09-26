# Reconstruction report — metabase#51020 (FE)

_Verbatim final report (a9e41d132d02fbf7c)._

---

## Reconstruction Report — metabase#51020

**(1) git diff**
Two files changed (both in the hook, which is what the discriminating oracle directly exercises):

- `frontend/src/metabase/actions/hooks/use-action-form/utils.ts` — re-added the `getChangedValues` helper the fix deleted.
- `frontend/src/metabase/actions/hooks/use-action-form/use-action-form.ts` — `getCleanValues` now returns `getChangedValues(formatted, initialValues)` instead of `formatted` (and restored `initialValues` to the `useCallback` deps).

(Full diff shown above.)

**(2) Oracle + baseline vs reconstructed**
- Discriminating oracle: `use-action-form/use-action-form.unit.spec.ts`
  - Baseline: `Tests: 7 passed, 7 total`
  - Reconstructed: `Tests: 2 failed, 5 passed, 7 total` (fails `getCleanValues › should return initial values if no values passed` and `› should filter out hidden fields`)
- Non-discriminating oracle: `ActionParametersInputForm.unit.spec.tsx` — passes in both states (9/9). Correctly not selected.

**(3) failure_shape**
Clean `expect(...).toEqual(...)` deep-equality assertion failure — `getCleanValues()` returns `{}` where the spec expects `{ param1: "some value" }`. Not a compile/type/arity error.

**(4) Confidence + adversarial reasoning**
High confidence. This reproduces the exact bug semantics: `getChangedValues` drops any submit value equal to its initial (prefetched) value, so a primary-key `id` populated as an initial value (via click-behavior/URL) gets filtered out and never sent to the execute endpoint — precisely issue #51020. This is a semantic reintroduction, not `git apply -R`: the fix removed a `prefetchesInitialValues`-gated branch plus the one hook test that set that prop, and stripped the prop from `ActionForm.tsx`/`ActionVizForm.tsx`. A literal revert restoring the prop-gated branch would not fire under the surviving oracle tests (none set the prop, which no longer exists), so it wouldn't fail any assertion. Applying the buggy `getChangedValues` transformation unconditionally in the hook is the load-bearing behavior and makes the surviving discriminating assertions fail. Verified the failure is an assertion (values), the other oracle is unaffected, and the change compiles (tests ran without type/import errors; `formatSubmitValues` and `getChangedValues` both used).

**(5) Ambiguity note**
The task listed `ActionForm.tsx` / `ActionVizForm.tsx` as the product files to localize, but those only threaded the now-removed `prefetchesInitialValues` prop — they contain no assertion-observable behavior for the hook oracle, and modifying them cannot make the discriminating hook spec (which calls `useActionForm` directly) fail. The behavior actually lives in `use-action-form.ts` + `utils.ts`, so localization landed there. No `reconstruction_failed`; a single-assertion discriminating oracle was available and now fails cleanly.
