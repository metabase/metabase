# Plan: Fix Transforms Collections Dirty State Issues

## Problem Summary

Two issues exist with transforms collections in DataStudio:

1. **Creating new transforms collections doesn't trigger dirty state rechecking**
2. **Transforms collections don't show in the changes view hierarchy**

---

## Issue 1: Dirty State Not Invalidated for Transforms Collections

### Root Cause

When a transforms collection is created, the frontend middleware doesn't invalidate the dirty state cache.

**Location**: `enterprise/frontend/src/metabase-enterprise/remote_sync/middleware/remote-sync-listener-middleware.ts:239-248`

```typescript
remoteSyncListenerMiddleware.startListening({
  matcher: collectionApi.endpoints.createCollection.matchFulfilled,
  effect: async (action: PayloadAction<Collection>, { dispatch }) => {
    const collection = action.payload;

    if (collection.is_remote_synced) {  // ← BUG: Only checks is_remote_synced
      invalidateRemoteSyncTags(dispatch);
    }
  },
});
```

The backend tracks transforms-namespace collections differently:
- Regular collections are tracked when `is_remote_synced = true`
- Transforms collections are tracked when `namespace = "transforms"` AND `remote-sync-transforms` setting is enabled

See `spec.clj:328-345`:
```clojure
(defmethod check-eligibility :collection
  [{:keys [eligibility]} object]
  (case (:collection eligibility)
    :any
    (or (collections/remote-synced-collection? (or collection-id object))
        (and (rs-settings/remote-sync-transforms)
             (transforms-namespace-collection? object)))))
```

### Fix

Modify the middleware to also invalidate tags when creating a transforms-namespace collection:

```typescript
// remote-sync-listener-middleware.ts

remoteSyncListenerMiddleware.startListening({
  matcher: collectionApi.endpoints.createCollection.matchFulfilled,
  effect: async (action: PayloadAction<Collection>, { dispatch, getState }) => {
    const collection = action.payload;

    // Check if this is a remote-synced collection
    const isRemoteSynced = collection.is_remote_synced;

    // Check if this is a transforms-namespace collection with transforms sync enabled
    const state = getState();
    const isTransformsSyncEnabled = getSetting(state, "remote-sync-transforms");
    const isTransformsCollection = collection.namespace === "transforms";

    if (isRemoteSynced || (isTransformsCollection && isTransformsSyncEnabled)) {
      invalidateRemoteSyncTags(dispatch);
    }
  },
});
```

Similar changes needed for:
- `collectionApi.endpoints.updateCollection.matchFulfilled` (lines 250-266)
- `collectionApi.endpoints.deleteCollection.matchFulfilled` (lines 268-286)

---

## Issue 2: Transforms Collections Not in Changes View Hierarchy

### Root Cause

The `AllChangesView` component fetches the collection tree without including the "transforms" namespace.

**Location**: `enterprise/frontend/src/metabase-enterprise/remote_sync/components/ChangesLists/AllChangesView.tsx:51-58`

```typescript
const { data: collectionTree = [] } = useListCollectionsTreeQuery({
  namespaces: [
    "",
    "analytics",
    ...(isUsingTenants ? ["shared-tenant-collection"] : []),
  ],
  "include-library": true,
});
```

When transforms entities are dirty, they have a `collection_id` that points to a transforms-namespace collection. Since this collection isn't in the tree, `buildCollectionMap` can't resolve it, and the path segments are wrong/empty.

### Fix

Add "transforms" to the namespaces when `remote-sync-transforms` setting is enabled:

```typescript
// AllChangesView.tsx

const isTransformsSyncEnabled = useSetting("remote-sync-transforms");

const { data: collectionTree = [] } = useListCollectionsTreeQuery({
  namespaces: [
    "",
    "analytics",
    ...(isUsingTenants ? ["shared-tenant-collection"] : []),
    ...(isTransformsSyncEnabled ? ["transforms"] : []),
  ],
  "include-library": true,
});
```

---

## Files to Modify

1. **`enterprise/frontend/src/metabase-enterprise/remote_sync/middleware/remote-sync-listener-middleware.ts`**
   - Add state access to collection create/update/delete listeners
   - Check for transforms-namespace collections in addition to `is_remote_synced`

2. **`enterprise/frontend/src/metabase-enterprise/remote_sync/components/ChangesLists/AllChangesView.tsx`**
   - Add `useSetting("remote-sync-transforms")` hook
   - Include "transforms" namespace conditionally in the collection tree query

---

## Testing

1. **Dirty state invalidation test**:
   - Enable remote-sync-transforms setting
   - Create a new transforms collection
   - Verify the dirty badge appears immediately without focus/refetch

2. **Changes view hierarchy test**:
   - Create transforms and transforms collections
   - Open the changes view
   - Verify transforms collections appear with correct hierarchy/path

---

## Implementation Order

1. Fix Issue 2 first (AllChangesView) - simpler change, one file
2. Fix Issue 1 (middleware) - more involved, needs state access pattern
