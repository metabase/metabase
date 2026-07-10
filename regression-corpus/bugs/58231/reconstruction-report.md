# Reconstruction report — metabase#58231 (FE, partial/all_specs_gone bucket)

_Verbatim report (ae820990eb7dad740)._

---

Reconstruction complete and verified. Here is the report.

## Report: bug metabase#58231 (fix commit ff8a240a, "Dashboard action warning text")

**The bug:** Action-parameter warning text (and the virtual-card mapping info text) was rendered as inline text inside the DashCard param mapper regardless of card size, so on small dashcards the text was visually cut off. The fix moved the warning into a tooltip on the info icon for small cards (`shouldShowActionParametersWarningInTooltip = isMobile || size_y*size_x <= 30 || size_x < 4`) and rewrote `showVirtualDashCardInfoText` to an area-based rule, keeping inline text only for large cards.

**(1) git diff** — I reverted the fix's three product hunks (the inverse of the fix commit) in the current tree:
- `.../DashCardParameterMapper/DashCardCardParameterMapper.tsx` — removed `additionalActionParametersContent` / `shouldShowActionParametersWarningInTooltip`, restored the always-inline `<span className={S.Warning}>` warning.
- `.../DashCardParameterMapper/DashCardCardParameterMapperContent.tsx` — restored the pre-fix `isVirtual && isDisabled` branch (no `additionalActionParametersContent` tooltip; dropped the prop from interface/destructure).
- `frontend/src/metabase/dashboard/utils.ts` — restored the pre-fix `showVirtualDashCardInfoText` (virtual → size check, non-virtual → always `true`).

Spec files were untouched.

**(2) Oracle used + baseline vs reconstructed**
- Oracle: `frontend/src/metabase/dashboard/components/DashCard/DashCardParameterMapper/DashCardCardParameterMapper.unit.spec.tsx` (the shipped `.jsx` was migrated to `.tsx`; the two discriminating `"should not cut off warning text"` tests — one under "Virtual cards", one under "Action parameter" — are present verbatim).
- Baseline (fix present): `Tests: 22 passed, 22 total`
- Reconstructed (bug): `Tests: 2 failed, 20 passed, 22 total`

**(3) failure_shape** — Exactly the two discriminating tests fail:
- Action parameter: `findByRole("tooltip")` resolves but `toHaveTextContent` mismatches — expected the action-parameter warning, received `"Open this card's action settings to connect variables"` (the tooltip carries only the mapping-info text; the action warning was never routed into a tooltip).
- Virtual cards: `findByRole("tooltip")` times out (no tooltip rendered) for the small (1×1) card, because pre-fix logic renders inline text instead of an icon+tooltip.

**(4) confidence + adversarial** — High. The failing assertions map directly to the "warning text cut off" semantics: on small cards the fix routes the warning into a hover tooltip, and the reverted code doesn't. The other 20 tests still pass, so the reconstruction didn't break unrelated behavior, and the failures are not spurious/compile errors. Adversarial check: the two failures come from two independently-reverted code paths (Content tooltip wiring + `showVirtualDashCardInfoText`), both genuinely part of the fix.

**(5) ambiguity** — Minor: the discriminating spec relocated only via a `.jsx → .tsx` migration (same path/dir, TypeScript-typed `setup`/`rerender` helper), not a content change; the two test bodies are identical to the shipped versions. No reconstruction failure.
