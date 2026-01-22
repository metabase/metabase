# Plan: Support Remote Syncing NativeQuerySnippets Globally

## Overview

Add support for globally syncing ALL NativeQuerySnippets and their collections when the Library collection is remote-synced. No separate setting is needed - snippet syncing is automatically tied to the Library collection's `is_remote_synced` status.

**Trigger**: When `(collection/library-collection)` has `is_remote_synced = true`, all snippets sync globally.

## Current State

### NativeQuerySnippet Remote Sync (existing)
- **Location**: `enterprise/backend/src/metabase_enterprise/remote_sync/spec.clj` (lines 110-124)
- **Eligibility**: Collection-based (`:collection :remote-synced`)
- **Behavior**: Only syncs snippets in remote-synced collections
- **Export Path**: `:collection-entity` type

### Transform Remote Sync (reference pattern)
- Uses `remote-sync-transforms` setting
- When enabled, syncs ALL transforms globally
- We'll follow similar pattern but check Library collection sync status instead

## Implementation Plan

### 1. Backend: Add Helper Function to Check Library Sync Status

**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/settings.clj`

Add helper function:
```clojure
(defn library-is-remote-synced?
  "Returns true if the Library collection exists and is remote-synced.
   When true, all snippets and snippet collections should be synced."
  []
  (when-let [library (collection/library-collection)]
    (collection/remote-synced-collection? library)))
```

### 2. Backend: Update NativeQuerySnippet Spec

**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/spec.clj`

Change the NativeQuerySnippet spec from collection-based to a new eligibility type that checks Library sync status:

**Current spec** (lines 110-124):
```clojure
:model/NativeQuerySnippet
{:model-type     "NativeQuerySnippet"
 :model-key      :model/NativeQuerySnippet
 :identity       :entity-id
 :events         {:prefix :event/snippet
                  :types  [:create :update :delete]}
 :eligibility    {:type       :collection
                  :collection :remote-synced}
 :archived-key   :archived
 :tracking       {:select-fields  [:name :id]
                  :field-mappings {:model_name :name}}
 :removal        {:statuses  #{"removed"}
                  :scope-key :collection_id}
 :export-path    {:type :collection-entity}
 :enabled?       true}
```

**New spec**:
```clojure
:model/NativeQuerySnippet
{:model-type     "NativeQuerySnippet"
 :model-key      :model/NativeQuerySnippet
 :identity       :entity-id
 :events         {:prefix :event/snippet
                  :types  [:create :update :delete]}
 :eligibility    {:type :library-synced}        ; New eligibility type
 :archived-key   :archived
 :tracking       {:select-fields  [:name :id]
                  :field-mappings {:model_name :name}}
 :removal        {:statuses  #{"removed"}}      ; Remove scope-key for global deletion
 :export-path    {:type :snippet-path}          ; New path type for snippets directory
 :export-scope   :all                           ; Export all snippets
 :enabled?       :library-synced}               ; Controlled by Library sync status
```

### 3. Backend: Add `:library-synced` Eligibility Type

**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/events.clj`

Add new eligibility check method:
```clojure
(defmethod check-eligibility :library-synced
  [_eligibility _entity]
  (settings/library-is-remote-synced?))
```

### 4. Backend: Add `spec-enabled?` Support for `:library-synced`

**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/spec.clj`

Update `spec-enabled?` to handle the `:library-synced` keyword:
```clojure
(defn spec-enabled?
  "Returns true if the spec is enabled."
  [spec]
  (let [enabled (:enabled? spec)]
    (cond
      (boolean? enabled) enabled
      (= enabled :library-synced) (settings/library-is-remote-synced?)
      (keyword? enabled) (boolean ((keyword (name enabled)))))))
```

### 5. Backend: Add Snippet Path Construction

**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/spec.clj`

Add new export path type `:snippet-path` to `construct-export-path` multimethod:

```clojure
(defmethod construct-export-path :snippet-path
  [_path-type entity]
  (let [collection (when (:collection_id entity)
                     (t2/select-one :model/Collection :id (:collection_id entity)))]
    (if collection
      ;; Snippets in collections: snippets/<collection-hierarchy>/<entity-id>
      (concat ["snippets"]
              (rest (serdes/path-for-collection collection))  ; Remove "collections" prefix
              [(serdes/eid->label entity)])
      ;; Root snippets: snippets/<entity-id>
      ["snippets" (serdes/eid->label entity)])))
```

### 6. Backend: Update Collection Eligibility for Snippets Namespace

**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/spec.clj` or `events.clj`

Update Collection eligibility to include snippets-namespace collections when Library is remote-synced:

```clojure
;; In the Collection eligibility check, a collection is eligible if:
;; 1. It's remote-synced, OR
;; 2. It's a transforms-namespace collection and remote-sync-transforms is enabled, OR
;; 3. It's a snippets-namespace collection and Library is remote-synced
```

Update `should-sync-collection?` function:
```clojure
(defn should-sync-collection?
  "Returns true if a collection should be synced."
  [collection]
  (or (collection/remote-synced-collection? collection)
      (and (= (:namespace collection) :transforms)
           (settings/remote-sync-transforms))
      (and (= (:namespace collection) :snippets)
           (settings/library-is-remote-synced?))))
```

### 7. Backend: Add Import Path Filter

**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/impl.clj`

Update the path filters in the import function to include snippets:

**Current** (around line 140):
```clojure
(let [path-filters (cond-> [#"collections/.*" #"databases/.*"]
                     (settings/remote-sync-transforms)
                     (conj #"transforms/.*"))]
```

**New**:
```clojure
(let [path-filters (cond-> [#"collections/.*" #"databases/.*"]
                     (settings/remote-sync-transforms)
                     (conj #"transforms/.*")
                     (settings/library-is-remote-synced?)
                     (conj #"snippets/.*"))]
```

### 8. Backend: Add Snippet Tracking Sync Function

**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/impl.clj`

Add `sync-snippet-tracking!` function to be called when Library collection's sync status changes:

```clojure
(defn sync-snippet-tracking!
  "Called when the Library collection's remote sync status changes. When enabled,
   marks all existing snippets and snippet collections for initial sync. When
   disabled, removes all snippet tracking entries."
  [enabled?]
  (if enabled?
    ;; Mark all snippets and snippet collections for sync
    (do
      ;; Mark snippets-namespace collections
      (doseq [collection (t2/select :model/Collection :namespace :snippets)]
        (rso/upsert-status! "Collection" (:entity_id collection) "create"
                           {:model_name (:name collection)
                            :model_collection_id (:id collection)}))
      ;; Mark all snippets
      (doseq [snippet (t2/select :model/NativeQuerySnippet)]
        (rso/upsert-status! "NativeQuerySnippet" (:entity_id snippet) "create"
                           {:model_name (:name snippet)})))
    ;; Remove all snippet tracking
    (do
      (t2/delete! :model/RemoteSyncObject :model_type "NativeQuerySnippet")
      (t2/delete! :model/RemoteSyncObject
                  :model_type "Collection"
                  :model_collection_id [:in {:select [:id]
                                             :from [:collection]
                                             :where [:= :namespace "snippets"]}]))))
```

### 9. Backend: Call Snippet Tracking on Library Sync Status Change

**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/events.clj` or appropriate event handler

When the Library collection's `is_remote_synced` changes, call `sync-snippet-tracking!`:

```clojure
;; In the collection update event handler, detect Library collection sync changes
(when (and (collection/is-library? collection)
           (contains? changes :is_remote_synced))
  (impl/sync-snippet-tracking! (:is_remote_synced changes)))
```

### 10. Backend: Update Dirty Detection

**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/models/remote_sync_object.clj`

Update `excluded-model-types` to exclude NativeQuerySnippet when Library is not remote-synced:

```clojure
(defn excluded-model-types
  "Returns set of model types to exclude from dirty detection based on settings."
  []
  (cond-> #{}
    (not (settings/remote-sync-transforms))
    (conj "Transform" "TransformTag")
    (not (settings/library-is-remote-synced?))
    (conj "NativeQuerySnippet")))
```

### 11. Tests

**File**: `enterprise/backend/test/metabase_enterprise/remote_sync/snippets_test.clj` (new file)

Create comprehensive tests:

1. Test snippet tracking is created when Library becomes remote-synced
2. Test snippet tracking is removed when Library is no longer remote-synced
3. Test snippets are exported when Library is remote-synced
4. Test snippets are not exported when Library is not remote-synced
5. Test snippet collections (`:snippets` namespace) are synced when Library is remote-synced
6. Test import includes snippets when Library is remote-synced
7. Test dirty detection excludes snippets when Library is not remote-synced
8. Test archived snippets are marked for deletion
9. Test snippet eligibility check returns correct value based on Library status

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `enterprise/backend/src/metabase_enterprise/remote_sync/settings.clj` | Modify | Add `library-is-remote-synced?` helper function |
| `enterprise/backend/src/metabase_enterprise/remote_sync/spec.clj` | Modify | Update NativeQuerySnippet spec, add `:snippet-path`, add `:library-synced` enabled check |
| `enterprise/backend/src/metabase_enterprise/remote_sync/events.clj` | Modify | Add `:library-synced` eligibility type, handle Library sync status changes |
| `enterprise/backend/src/metabase_enterprise/remote_sync/impl.clj` | Modify | Add snippet path filter, add `sync-snippet-tracking!` |
| `enterprise/backend/src/metabase_enterprise/remote_sync/models/remote_sync_object.clj` | Modify | Update `excluded-model-types` |
| `enterprise/backend/test/metabase_enterprise/remote_sync/snippets_test.clj` | New | Comprehensive tests |

## Implementation Order

1. **Phase 1: Core Infrastructure**
   - Add `library-is-remote-synced?` helper
   - Add `:library-synced` eligibility type
   - Update `spec-enabled?` for `:library-synced`

2. **Phase 2: Spec Updates**
   - Update NativeQuerySnippet spec
   - Add `:snippet-path` export path type
   - Update Collection eligibility for snippets namespace

3. **Phase 3: Tracking & Import**
   - Add `sync-snippet-tracking!` function
   - Hook into Library collection sync status change events
   - Add import path filter for snippets
   - Update dirty detection exclusions

4. **Phase 4: Testing**
   - Create comprehensive test file
   - Test all edge cases

## Key Differences from Transform Implementation

| Aspect | Transforms | Snippets |
|--------|------------|----------|
| Trigger | `remote-sync-transforms` setting | Library collection `is_remote_synced` |
| Setting required | Yes | No |
| Eligibility type | `:setting` | `:library-synced` (new) |
| Collections namespace | `:transforms` | `:snippets` |
| Export path | `transforms/...` | `snippets/...` |

## Notes

- No frontend changes needed (no new setting to toggle)
- Snippet sync is implicitly enabled when Library is remote-synced
- All snippets sync globally (not scoped to specific collections)
- Snippet collections (`:snippets` namespace) also sync when enabled
