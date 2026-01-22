# Plan: Frontend Snippet Dirty State Refresh

## Overview

Implement declarative support for refreshing dirty status when snippets are created/updated/deleted in the frontend. This ensures snippet dirty state is properly reflected as library dirty state.

## Background

### Current State
- Backend support for snippet remote sync was added in commit `d7bfe1a05af`
- Snippets live in collections with `namespace: "snippets"` - NOT within the Library collection hierarchy
- The Library section in the UI displays snippets, so snippet dirty state should show as Library dirty

### What Was Missing
1. **Snippets not in `MODEL_MUTATION_CONFIGS`** - Snippet mutations didn't trigger dirty state invalidation
2. **`useHasLibraryDirtyChanges` didn't check snippets** - It only checked the Library collection tree, not snippets-namespace collections

## Implementation

### Change 1: Add Snippet to Model Mutation Configs

**File**: `enterprise/frontend/src/metabase-enterprise/remote_sync/middleware/model-configs.ts`

Added import for `snippetApi` and snippet config to `MODEL_MUTATION_CONFIGS`:

```typescript
import { snippetApi } from "metabase/api/snippet";

// In MODEL_MUTATION_CONFIGS array:
{
  modelType: "snippet",
  createEndpoints: [snippetApi.endpoints.createSnippet.matchFulfilled],
  updateEndpoints: [snippetApi.endpoints.updateSnippet.matchFulfilled],
  invalidation: { type: InvalidationType.Always },
},
```

This ensures:
- When `createSnippet` or `updateSnippet` mutations complete, dirty state tags are invalidated
- Snippet archiving (deletion) uses `updateSnippet` with `archived: true`, so it's covered

### Change 2: Update Library Dirty Changes Hook

**File**: `enterprise/frontend/src/metabase-enterprise/remote_sync/hooks/use-has-library-dirty-changes.ts`

Updated to also check for dirty snippets and snippets-namespace collections:

1. Added fetch for snippets-namespace collections:
   ```typescript
   const { data: snippetsCollections = [] } = useListCollectionsTreeQuery(
     { namespace: "snippets" },
     { skip: !isGitSyncVisible },
   );
   ```

2. Added check for dirty snippets before checking Library tree:
   ```typescript
   const hasSnippetDirtyChanges = dirty.some((entity) => {
     if (entity.model === "snippet") {
       return true;
     }
     if (
       entity.model === "collection" &&
       numericSnippetCollectionIds.has(entity.id)
     ) {
       return true;
     }
     return false;
   });

   if (hasSnippetDirtyChanges) {
     return true;
   }
   ```

## Files Changed

| File | Change |
|------|--------|
| `enterprise/frontend/src/metabase-enterprise/remote_sync/middleware/model-configs.ts` | Add snippetApi import and snippet config |
| `enterprise/frontend/src/metabase-enterprise/remote_sync/hooks/use-has-library-dirty-changes.ts` | Add snippet dirty state detection |

## How It Works

1. User creates/updates/archives a snippet
2. RTK Query mutation completes (`createSnippet.matchFulfilled` or `updateSnippet.matchFulfilled`)
3. Listener middleware detects the mutation via `MODEL_MUTATION_CONFIGS`
4. Middleware invalidates `REMOTE_SYNC_INVALIDATION_TAGS` (including `collection-dirty-entities`)
5. `useRemoteSyncDirtyState` refetches dirty entities from `/api/ee/remote-sync/dirty`
6. `useHasLibraryDirtyChanges` checks if any dirty entity is:
   - A snippet (`model === "snippet"`)
   - A collection in the snippets namespace
   - An entity in the Library collection tree
7. If any match, Library shows as dirty in the UI

## Testing

### Manual Testing Steps
1. Enable remote sync on Library collection
2. Create a new snippet in the SQL editor or Data Studio
3. Verify Library shows dirty indicator
4. Update an existing snippet
5. Verify Library shows dirty indicator
6. Archive a snippet
7. Verify Library shows dirty indicator
8. Export changes
9. Verify dirty indicators clear

## Status: IMPLEMENTED
