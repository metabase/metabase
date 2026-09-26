Reconstruction succeeded. Report below.

## Reconstruction Report — metabase#45638 (fix `abfda359`, PR #52368 "Fix passing a font for static embedded question")

**Oracle relocation:** The fix commit's product change lived in `use-embed-font.ts` (moved dashboard/hooks → public/hooks) + a `useEffect`/`setFont` in `PublicOrEmbeddedQuestion.tsx`, with two jest specs (`use-embed-font.unit.spec.tsx` new; `use-dashboard-url-params.unit.spec.tsx` mock-path only). At current HEAD both the shipped-candidate spec and the `useEmbedFont`/`setFont` hook are **gone**. The hook was refactored into `useSetEmbedFont({ location })` (reads `font` from `location.hash` and dispatches `setOptions`), and the surviving discriminating spec is **`frontend/src/metabase/public/hooks/use-set-embed-font.unit.spec.tsx`** — the direct descendant of the fix-added `use-embed-font.unit.spec.tsx`, testing the same semantic (font parsed from hash → applied to embed options). No surviving component-level jest spec asserts font (original component behavior was cypress-only).

**(1) git diff** — minimal semantic revert in `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ab4e4e9a5b494d74b/frontend/src/metabase/public/hooks/use-set-embed-font.ts`: drop the parsed `font` and dispatch `font: undefined` (reproduces "font not passed"). Diff as shown above.

**(2) Oracle + results**
- Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/public/hooks/use-set-embed-font.unit.spec.tsx` (from worktree root)
- Baseline (HEAD): `Tests: 1 passed, 1 total`
- Reconstructed (revert applied): `Tests: 1 failed, 1 total`

**(3) failure_shape:** Assertion failure at spec line 37 — `expect(getEmbedOptionsState().font).toBe("Roboto")` → `Expected: "Roboto", Received: undefined`. The `#font=Roboto` hash option is no longer propagated to embed state — exactly the semantics of bug #52368 (font dropped for static embed).

**(4) Confidence: high.** Clean value-level assertion failure (not a compile/import error), on the precise state the fix restores. Adversarial: the discriminating assertion checks the concrete applied font value; it fails only when hash-font application is broken, and the second assertion (`""` → `undefined`) is unaffected — so the failure isolates the reverted behavior rather than an incidental break. The revert is 2 lines and touches only the font-application path.

**(5) Ambiguity:** The original bug's *location* was the component (`PublicOrEmbeddedQuestion` failing to call the font hook); the surviving jest coverage only reaches the *hook* level, so the faithful reconstruction moves the defect into the hook (`useSetEmbedFont`) that now owns the hash-read-and-apply logic. Same observable semantic (embedded font not passed), different injection point. reconstruction_failed: no — reconstructed successfully.