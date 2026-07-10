# Reconstruction report — metabase#57557 (FE)

_Verbatim report (ad29be3ab0e378995)._

---

I have enough evidence for a definitive conclusion. Let me record the key facts confirming the honest-negative.

The investigation is complete. Here is my report.

## Reconstruction Result: `reconstruction_failed`

### Category: `no_unit_oracle__real_oracle_cypress`

The named unit spec is **not** the real oracle for this bug. The genuine oracle is the Cypress e2e test the fix added (`e2e/test/scenarios/models/reproductions.cy.spec.ts`, `describe("issue 57557")`).

### (1) git diff
Working tree is **clean** — no diff. I applied and then reverted an experimental change (see below) after it failed to reproduce.

### (2) Oracle runs
- **Baseline (fix present):** `Tests: 17 passed, 17 total` ✅
- **After faithful semantic revert** of the product code (see below): `Tests: 17 passed, 17 total` ✅ — **assertions did NOT fail.**

### (3) Failure shape
None achievable via product-only revert. The unit oracle cannot distinguish bug from fix.

### (4) Confidence + adversarial reasoning
**High confidence** this is a genuine honest-negative.

What the fix actually changed (drifted file paths — the fix's `QuestionMoreActionsMenu.tsx` moved into `QuestionActions/QuestionMoreActionsMenu/`):
- Product: `const { isEditable: hasDataPermissions } = Lib.queryDisplayInfo(question.query())` → `hasDataPermissions = underlyingQuestion != null && Lib.queryDisplayInfo(underlyingQuestion.query()).isEditable`, where `underlyingQuestion = useSelector(getQuestionWithoutComposing)`.
- The `selectors.js` change is a **pure rename** (`getQuestionWithParameters`→`getQuestionWithoutComposing`); the selector body is byte-for-byte identical, so it's behavior-neutral.
- The spec change added `qb: createMockQueryBuilderState({ card })` and `.mockImplementation(...)` to two spies — **setup only. The fix added/modified NO `expect(...)` assertions.** The line-169 assertion (`"Edit query definition"` absent without data perms) existed pre-fix unchanged.

Why the bug can't manifest in this unit spec:
- The real bug: a **composed** model question reports `isEditable: true` even without data permissions (composition wraps the model's virtual `card__ID` table, which is notebook-editable). The fix reads the **underlying, non-composed** question instead.
- In the unit test the prop `question = metadata.question(card.id)` is the **raw, non-composed** model. Its `.query().isEditable` already correctly reflects data permissions (driven solely by whether `createSampleDatabase()` is in entities). Both the buggy (`question.query()`) and fixed (`underlyingQuestion.query()`) paths derive `isEditable` from the same metadata, so they compute the **same value** in every test case.
- I empirically applied the faithful pre-fix product code and got **17/17 pass** — proving the product bug is invisible to this oracle. The `qb` setup addition was needed only to keep the *fixed* product's positive cases green (else `underlyingQuestion` is `undefined` → `hasDataPermissions` always false), not to catch the bug.
- The two files the task named to localize (`DatasetEditorInner.jsx`, `EditorTabs.tsx`) are **never rendered by `QuestionActions`** — their behavior (`disabledQuery`/`editor-tabs-query` disabled tab) is asserted only by the Cypress test (`cy.findByTestId("editor-tabs-query").should("be.disabled")`).

### (5) reconstruction_failed + category
- **category:** `no_unit_oracle__real_oracle_cypress`
- **reconstructable?** Yes — but only against the Cypress oracle (`issue 57557` in `reproductions.cy.spec.ts`), which drives a real composed model with a no-data-permissions user. The named unit spec (`QuestionActions.unit.spec.tsx`) is structurally incapable of catching this bug because it never composes the model question; its fix-commit changes were setup accommodations, not bug-catching assertions.
