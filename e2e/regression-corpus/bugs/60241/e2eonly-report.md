Both the mutation and witness are in place. Task complete.

---

## Report

### 1. git diff (product mutation)
Reintroduces the bug in `frontend/src/metabase/api/user.ts` — removes `listTag("permissions-group")` from the `createUser` mutation's `invalidatesTags` (semantic revert of fix commit `75917ecd`, which had also since gained `listTag("tenant")`):

```diff
       invalidatesTags: (_, error) =>
-        invalidateTags(error, [
-          listTag("user"),
-          listTag("tenant"),
-          listTag("permissions-group"),
-        ]),
+        invalidateTags(error, [listTag("user"), listTag("tenant")]),
```

### 2. Witness
Added to the existing `frontend/src/metabase/api/user.unit.spec.ts` (new `describe("createUser (metabase#60241)")` block plus a `permissionApi` import). It holds a live RTK Query subscription to `listPermissionsGroups`, dispatches `createUser` (joining the Administrators group), and asserts the subscribed group list refetches (GET `/api/permissions/group` fires a second time) because the mutation invalidated the `permissions-group` tag.

Oracle command:
```
bun run test-unit-keep-cljs frontend/src/metabase/api/user.unit.spec.ts -t "metabase#60241"
```
- PASS on clean HEAD (fix restored): `✓ invalidates the permissions-group list so a subscribed group query refetches`
- FAIL on mutant: `expect(received).toHaveLength(expected) — Expected length: 2, Received length: 1` (only the initial GET; no refetch after createUser).

The assertion is a clean behavioral discriminator, not a compile error.

### 3. Bug summary
Creating a user and assigning them to the Administrators group did not invalidate the cached permissions-group list. The admin People page renders each user's role from that cached data, so a newly created admin showed no "Admin" role until a manual page refresh forced a refetch. The e2e repro invites a user into Administrators and asserts the "Admin" role appears in the list row immediately.

### 4. Outcome
`witness_authored` — the bug is unit-catchable. The behavior lives entirely in a pure RTK Query cache-invalidation declaration; a store-level unit test with fetch-mock observes the refetch (or its absence) without any browser, routing, or layout dependency. The e2e is replaceable at the unit level.

### 5. Confidence
High. The mutation is the exact inverse of the shipped fix at the same seam, and the observable mechanism the e2e depends on (tag invalidation → refetch of the subscribed group list → updated role in UI) is precisely what the witness asserts at the store level. The witness cleanly flips (PASS clean / FAIL mutant) on the single tag being present vs absent.

Note: the worktree needed one missing dep, `@stardazed/streams-text-encoding@1.0.2` (declared in this branch's package.json but absent from the shared `node_modules`), copied in from the bun cache so jest-setup could load — an additive environment fix, no source change.