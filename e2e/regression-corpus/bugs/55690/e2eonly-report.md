The mutation is a clean semantic inverse of the fix. Both directions are now verified (PASS on clean confirmed earlier, FAIL on mutant confirmed). Let me write up the report.

## Report

**Issue:** metabase#55690 — fix commit `cf806ce4` ("Growing entity picker", #56462). Shipped with only a Cypress e2e repro (`entity-picker.cy.spec.ts` → "should grow in width as needed, but not shrink").

### 1. git diff (product mutation)

File: `frontend/src/metabase/common/components/Pickers/EntityPicker/components/EntityPickerModal.tsx` (the fix's `EntityPickerModal.tsx` moved here from `common/components/EntityPicker/...`; logic is byte-identical to the fix).

Semantic revert = the exact inverse of the fix. Removed the `useState(920)` min-width state, the `useRef`, the `ResizeObserverEntry` handler (`currentWidth < width ? width : currentWidth` — the grow-not-shrink monotone-max), the `resizeObserver.subscribe/unsubscribe` callback ref, and the `metabase/utils/resize-observer` import. Reverted `Modal.Content` from `miw={min(${modalContentMinWidth}px, 80vw)} w="fit-content" maw="80vw" ref={...}` back to the pre-fix fixed `w="57.5rem"` (= 920px). Compiles cleanly — `useCallback`/`useState` are still used elsewhere, no dangling refs.

### 2. Witness

New spec: `frontend/src/metabase/common/components/Pickers/EntityPicker/components/test/EntityPickerModal-grow.unit.spec.tsx`. It reuses the existing `./setup` harness to render the real modal, mocks `metabase/utils/resize-observer` to capture the subscribed callback, and synthetically fires it (jsdom does no layout, so the real observer never fires). Assertions read the inline `min-width` style token on `Modal.Content`:

```
expect(content.style.minWidth).toBe("min(920px, 80vw)");   // default floor
fireContentResize(1097);
expect(content.style.minWidth).toBe("min(1097px, 80vw)");  // grows
fireContentResize(800);
expect(content.style.minWidth).toBe("min(1097px, 80vw)");  // does NOT shrink
```

Oracle command:
`bun run test-unit-keep-cljs frontend/src/metabase/common/components/Pickers/EntityPicker/components/test/EntityPickerModal-grow.unit.spec.tsx`

- **PASS on clean HEAD:** `✓ should grow its min-width to fit content, but never shrink back`
- **FAIL on mutant:** `expect(received).toBe(expected)` — `Expected: "min(920px, 80vw)"`, `Received: ""` (mutant's fixed `w="57.5rem"` content has no `min-width` at all → clean assertion failure, not a compile error).

### 3. Bug summary

Before the fix the entity-picker modal was a fixed 57.5rem (920px) wide. Deeper collection trees (more side-by-side columns than fit in 920px) got clipped / horizontally scrolled inside the fixed box instead of the modal widening. The fix made the modal `width: fit-content` with a `min-width` floor that a ResizeObserver ratchets upward to the largest observed content width (capped at 80vw) and never lowers, so the picker grows as you drill deeper and stays wide when you navigate back. The reintroduced mutant restores the fixed 920px and the grow-not-shrink behavior disappears.

### 4. Outcome

**witness_authored** — the bug is unit-catchable. The observable in the e2e is real-browser rendered `width` in px (920→1097→1200→1198), which jsdom cannot compute; but the *product logic that produces it* — the monotone-max `min-width` state driven by the resize callback — is a near-pure seam directly assertable at the unit level via the Mantine style prop. The e2e is replaceable by this jest witness.

### 5. Confidence

High. The mutation is the precise inverse of the fix commit's product diff (same three-prop change on `Modal.Content` plus removal of the identical resize machinery), so it faithfully reproduces the pre-fix fixed-width bug. The witness discriminates on the exact state the fix added: it grows (920→1097) and refuses to shrink (stays 1097 when fed 800), matching both halves of the e2e's "grow but not shrink" assertion. The only part not reproduced in jsdom is the concrete pixel measurement (a genuine real-browser layout concern), but that is downstream of the unit-testable `min-width` logic the witness pins.