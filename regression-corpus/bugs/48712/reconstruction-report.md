Reconstruction complete. Here is the report.

## 1. `git diff`

```diff
diff --git a/frontend/src/metabase/querying/components/CodeMirrorEditor/completers.tsx b/frontend/src/metabase/querying/components/CodeMirrorEditor/completers.tsx
@@ -69,8 +69,6 @@ export function useSchemaCompletion({ databaseId }: SchemaCompletionOptions) {
         return null;
       }
 
-      const suffix = matchAfter(context, /\w+/);
-
       const { data } = await listAutocompleteSuggestions({
@@ -91,7 +89,7 @@ export function useSchemaCompletion({ databaseId }: SchemaCompletionOptions) {
       return {
         from: word.from,
-        to: suffix?.to,
+        to: undefined,
```

Product file (drifted location): `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-af899c79b2b14ef93/frontend/src/metabase/querying/components/CodeMirrorEditor/completers.tsx`

This is a minimal semantic revert of the commit's "Allow completing from inside a word" behavior — the schema completer no longer extends the completion range past the cursor to cover the rest of the word (`to` falls back to the cursor, as it did pre-fix).

## 2. Oracle + baseline vs reconstructed

- Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/querying/components/CodeMirrorEditor/completers.unit.spec.tsx` (from worktree root; symlinks confirmed — baseline runs real tests, not a false-pass)
- Surviving discriminating spec: `frontend/src/metabase/querying/components/CodeMirrorEditor/completers.unit.spec.tsx`
- Baseline: `Tests: 37 passed, 37 total`
- Reconstructed: `Tests: 1 failed, 36 passed, 37 total` — the single failure is `useSchemaCompletion › should complete even when inside a word`

## 3. failure_shape

`toEqual` deep-equality mismatch on the completion object for input `"AAA\nSELECT S|EA"`:
```
-   "to": 14,
+   "to": undefined,
```
at `completers.unit.spec.tsx:159`. Expected `to: 14` (completion spans the whole word `SEA`), received `to: undefined` (completion stops at the cursor).

## 4. Confidence + adversarial

Confidence: high. The failure is exactly the one fix-added assertion covering the "complete from inside a word" behavior; the other 36 tests (including all the other `inside a word` variants for snippets/cards/locals/keywords) stay green, so the revert is targeted, not a blunt sabotage. Adversarial: the first attempt (`to: word.to`) over-broadened, breaking 3 unrelated tests because it introduced a defined `to` where the object shape expects none; switching to the faithful pre-fix value (`to: undefined`, cursor default) isolates the failure to the discriminating assertion. The spec still compiles/runs (unused `matchAfter` helper is inert under the jest/babel transform).

## 5. Ambiguity

The pipeline's named hints were both dead ends and I reconstructed via a different surviving spec + product file from the same squashed PR (#51632, which bundles the #48712 fixes):
- `frontend/src/metabase-lib/native.ts` (the named product file) — its change is type-only (`engine(query): string` → `string | null`); the runtime null-handling lives in compiled CLJS (`js.cljs` `some-> ... name`) which `test-unit-keep-cljs` does not rebuild. Not runtime-discriminating in a jest spec.
- `DatasetQueryEditor.unit.spec.tsx` (the named oracle candidate) — the fix-commit hunk there was pure *removals* of AceEditor mocks; AceEditor is now deleted, so those lines contain no fix-added assertions and are unreconstructable.

The genuine, reconstructable fix-added assertions from this commit survive in `completers.unit.spec.tsx` (and `CodeMirrorEditor/util.unit.spec.tsx`), testing the CodeMirror autocomplete behavior that #48712's reproduction exercises. I selected the inside-word assertion as the discriminating one.