The mutation and witness are both in place. Task complete.

## Report

### 1. git diff (product mutation)
Semantic revert of fix commit `b336da1` in the current (drifted) file `frontend/src/metabase/querying/components/SnippetSidebar/SnippetSidebar.tsx` (was a `.jsx` at `query_builder/components/template_tags/` at fix time; since converted to TSX and relocated). Two coupled reverts:

```diff
+    const hasParentCollection = snippetCollection.parent_id !== null;
     const onSnippetCollectionBack = () => {
-      const parentCollectionId = snippetCollection.parent_id ?? "root";
-
       const hasPermissionToSeeParent = snippetCollections.some(
         (collection) =>
           canonicalCollectionId(collection.id) ===
-          canonicalCollectionId(parentCollectionId),
+          canonicalCollectionId(snippetCollection.parent_id),
       );
...
                     <SidebarHeader
                       title={snippetCollection.name}
-                      onBack={onSnippetCollectionBack}
+                      onBack={
+                        hasParentCollection ? onSnippetCollectionBack : null
+                      }
                     />
```

The load-bearing part is the `onBack` gating: in a top-level snippet folder (`parent_id === null`) the back button is suppressed.

### 2. Witness
New spec: `frontend/src/metabase/querying/components/SnippetSidebar/SnippetSidebar.unit.spec.tsx`. It renders the real `SnippetSidebar` (jsdom + fetch-mocked collection/snippet/items endpoints) pointed at a top-level snippet folder (`parent_id: null`, id 10, name "Folder A"), then asserts the header exposes a back affordance:

```tsx
const header = screen.getByTestId("sidebar-header");
expect(within(header).queryByLabelText("chevronleft icon")).toBeInTheDocument();
```

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/querying/components/SnippetSidebar/SnippetSidebar.unit.spec.tsx`

- PASS on clean HEAD (chevronleft rendered because `onBack` is always supplied).
- FAIL on mutant, clean assertion: `expect(received).toBeInTheDocument() ... Received has value: null` — `SidebarHeader` renders the `chevronleft` icon only when `onBack` is truthy, and the mutant passes `null`.

### 3. Bug summary
When you drill into a top-level snippet folder (one directly under the implicit snippet root, so `parent_id === null`), the sidebar header's back button disappears, trapping you in that folder with no way to return to the "Snippets" root. The e2e (`snippets.cy.spec.js`, metabase#63405) walks Snippets → Folder A → Folder B, then back Folder B → Folder A → expects to land back at "Snippets" — the final hop fails under the bug because Folder A (top-level) shows no back control.

### 4. Outcome
`witness_authored` — the bug is unit-catchable, so the e2e is replaceable. The behavior is a pure function of one prop (`snippetCollection.parent_id`) rendered into DOM (`SidebarHeader`'s `onBack` → chevron), fully reproducible in jsdom with mocked fetch. No routing, real browser, layout/geometry, or network semantics are involved.

### 5. Confidence
High. The mutation is a faithful, minimal restoration of the exact pre-fix logic (both the `hasParentCollection` gate and the non-`?? "root"` permission check), verified by the witness discriminating cleanly (PASS clean / FAIL mutant) at the same seam the fix touched. The single residual gap vs. a full e2e is that the unit test asserts the back control's presence rather than clicking through a multi-level navigation stack, but presence of `onBack` is precisely the property the fix restored.