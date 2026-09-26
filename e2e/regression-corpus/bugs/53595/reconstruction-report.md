# Reconstruction report — metabase#53595 (FE, partial/all_specs_gone bucket)

_Verbatim report (a17ca58ceea8a9e51)._

---

I have a clean, deterministic discriminator. Here is my report.

## Reconstruction report — bug metabase#53595

**Bug.** "Filtering the semantic types list is slow/broken." Fix commit `db12bcbd` (PR #54965) migrated the datamodel field pickers off the legacy `metabase/core/components/Select` (which searched via `searchProp="name"`/`globalSearch` and filtered poorly) onto the Mantine `Select` with `searchable`. The e2e repro added in the same commit (`reproductions.cy.spec.js`, "issue 53595") opens the `column-ID` semantic-type picker, types `cu`, and asserts `Currency` is visible and the popover isn't over-scrolled — i.e. the list actually narrows as you type.

**Oracle / spec location.** The two shipped specs named in the task (`MetadataEditor.unit.spec.tsx`, `MetadataFieldSettings.unit.spec.tsx`) are gone — the whole `admin/datamodel/metadata/components` tree was relocated to `frontend/src/metabase/metadata/components/`. The task's localized files (`FieldGeneralSettings`, `FieldVisibilityPicker`) are a red herring for #53595: the visibility picker is a fixed 5-item non-searchable list. The actual #53595 discriminator lives in `SemanticTypePicker`. A spec exists — `frontend/src/metabase/metadata/components/SemanticTypePicker/SemanticTypePicker.unit.spec.tsx` — but it only asserts option *visibility by field type*; it never exercises type-to-filter. So I reconstructed the missing discriminating assertion (the shipped "should allow to search for field semantic types" test, which typed `Pri` → `Price` visible / `Score` gone) into that spec.

**(1) git diff** — added one test + reintroduced the bug (removed `searchable`):
- `SemanticTypePicker.tsx`: removed the `searchable` prop from the Mantine `Select`.
- `SemanticTypePicker.unit.spec.tsx`: added `"filters the semantic types list as the user types (metabase#53595)"` — opens the picker for a numeric field, confirms `Currency` and `Score` both present, then `clear()` + `type("cu")` and asserts `Currency` stays / `Score` disappears.

**(2) Oracle used:** `bun run test-unit-keep-cljs <spec> -t "filters the semantic types list"` (jest, from worktree root).
- Baseline (fixed product, `searchable` present): `Tests: 23 skipped, 1 passed, 24 total` — PASS.
- Reconstructed (bug reintroduced, `searchable` removed): `Tests: 1 failed, 23 skipped, 24 total` — FAIL.

**(3) failure_shape.** `userEvent.clear(picker)` throws `clear() is only supported on editable elements`. Without `searchable`, the Mantine `Select` input is read-only, so the semantic-types list cannot be filtered by typing at all — the exact user-facing symptom of #53595 (you can't narrow the list). The failure surfaces at the `clear()`/type step, before the visibility assertions, because typing is impossible once the fix is removed.

**(4) Confidence + adversarial.** High. Both directions are deterministic (no timing/flake): fixed → editable search input filters; buggy → read-only input, cannot filter. Adversarial notes: (a) The reconstruction removes the precise fix mechanism (`searchable`) rather than corrupting the filter predicate — in the current Mantine architecture `searchable` *is* the fix, so its removal is the faithful semantic inverse. (b) The failure is a thrown error (input non-editable) rather than an assertion mismatch; it's still fully discriminating, and it's forced by the baseline needing `clear()` (the selected label "No semantic type" pre-fills the search box — the shipped test cleared for the same reason). (c) The test is legitimately new coverage: the existing suite would still pass with `searchable` removed for every non-typing test, so this assertion is what closes the gap the culled e2e repro covered.

**(5) Outcome.** Not a reconstruction_failure — a discriminating jest spec was reconstructable and verified (baseline PASS / reconstructed FAIL). Ambiguity: the only judgment call is *where* the discriminator belongs; #53595's behavior is genuinely in `SemanticTypePicker`, not the task-named `FieldVisibilityPicker`/`FieldGeneralSettings`, so I localized to the component that actually owns the filtering behavior. Working tree is left in the reconstructed (buggy) state so the diff and the failing run correspond; re-adding `searchable` restores green.
