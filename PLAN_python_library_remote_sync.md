# Plan: Remote-Sync Support for PythonLibrary

## Overview

This plan implements remote-sync support for the `PythonLibrary` entity, enabling Python libraries (reusable code for Python transforms) to be synchronized with a Git repository.

## Background

### Current PythonLibrary State
- **Model**: `:model/PythonLibrary` (table: `python_library`)
- **Identity**: Path-based (unique `path` column, currently only supports `common.py`)
- **Fields**: `id`, `path`, `source`, `created_at`, `updated_at`
- **Serialization**: Explicitly excluded in `excluded-models`
- **Access**: Superuser-only
- **Feature flag**: `transforms-python` premium feature

### Remote-Sync Pattern Requirements
Based on similar entities (Transforms, NativeQuerySnippets), PythonLibrary needs:
1. Backend spec definition in `spec.clj`
2. Serialization support (currently excluded)
3. Event handling for create/update/delete
4. Frontend type and config updates

## Design Decisions

### Identity Strategy: `:path`
Since PythonLibrary uses `path` as its unique identifier (not `entity_id`), use path-based identity similar to Table/Field models.

### Eligibility: Setting-based (tied to transforms)
PythonLibrary is tightly coupled with Python transforms. Use the existing `remote-sync-transforms` setting to control eligibility - when transforms are synced, so are their associated libraries.

### Export Path Type: `:python-library-path`
New path type exporting to `python-libraries/{path}.yaml` structure.

### Export Scope: `:all`
Global scope - export all PythonLibrary instances (similar to TransformTag/NativeQuerySnippet).

---

## Implementation Steps

### Phase 1: Backend - Serialization Support

#### Step 1.1: Add PythonLibrary to serialization models list
**File**: `enterprise/backend/src/metabase_enterprise/serialization/v2/models.clj`

- Remove `PythonLibrary` from `excluded-models` list
- Add `:model/PythonLibrary` to the models list (likely in a transforms-related section)

#### Step 1.2: Implement serialization methods for PythonLibrary
**File**: `enterprise/backend/src/metabase_enterprise/transforms_python/models/python_library.clj`

Add serdes methods:
```clojure
(defmethod serdes/hash-fields :model/PythonLibrary [_model] [:path])

(defmethod serdes/make-spec "PythonLibrary" [_model-name _opts]
  {:copy [:path :source]})

(defmethod serdes/entity-id :model/PythonLibrary [{:keys [path]}] path)

(defmethod serdes/generate-path :model/PythonLibrary [_ {:keys [path]}]
  [{:model "PythonLibrary" :id path}])
```

#### Step 1.3: Implement serdes ingestion methods
**File**: `enterprise/backend/src/metabase_enterprise/transforms_python/models/python_library.clj`

Add ingestion support:
```clojure
(defmethod serdes/load-xform "PythonLibrary" [entity]
  (-> entity
      (dissoc :serdes/meta)
      (assoc :path (-> entity :serdes/meta first :id))))

(defmethod serdes/load-find-local "PythonLibrary" [path]
  (t2/select-one :model/PythonLibrary :path (-> path last :id)))

(defmethod serdes/load-update! "PythonLibrary" [_model-name ingested local]
  (t2/update! :model/PythonLibrary (:id local) ingested))

(defmethod serdes/load-insert! "PythonLibrary" [_model-name ingested]
  (t2/insert-returning-instance! :model/PythonLibrary ingested))
```

---

### Phase 2: Backend - Remote-Sync Spec

#### Step 2.1: Add PythonLibrary spec to remote-sync
**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/spec.clj`

Add spec definition:
```clojure
:model/PythonLibrary
{:model-type     "PythonLibrary"
 :model-key      :model/PythonLibrary
 :identity       :path
 :events         {:prefix :event/python-library
                  :types  [:create :update :delete]}
 :eligibility    {:type    :setting
                  :setting :remote-sync-transforms}
 :archived-key   nil  ; PythonLibrary has no archived state
 :tracking       {:select-fields  [:path]
                  :field-mappings {:model_name :path}}
 :removal        {:statuses  #{"removed"}
                  :scope-key nil}  ; global scope
 :export-path    {:type :python-library-path}
 :export-scope   :all
 :enabled?       :remote-sync-transforms}
```

#### Step 2.2: Implement python-library-path export path type
**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/spec.clj`

Add path generation method:
```clojure
(defmethod export-path-segments :python-library-path
  [_type {:keys [path]}]
  ["python-libraries" (str (str/replace path #"\.py$" "") ".yaml")])
```

#### Step 2.3: Add path identity handler if needed
**File**: `enterprise/backend/src/metabase_enterprise/remote_sync/spec.clj`

Verify that the `:path` identity type properly handles PythonLibrary's path-based identification:
```clojure
(defmethod get-model-identity :path
  [spec instance]
  ;; May need to handle PythonLibrary specifically or ensure generic path handling works
  ...)
```

---

### Phase 3: Backend - Event Handling

#### Step 3.1: Add PythonLibrary events to the events system
**File**: `enterprise/backend/src/metabase_enterprise/transforms_python/models/python_library.clj`

Add event publication on model changes:
```clojure
(t2/define-after-insert :model/PythonLibrary [library]
  (events/publish-event! :event/python-library-create library)
  library)

(t2/define-after-update :model/PythonLibrary [library]
  (events/publish-event! :event/python-library-update library)
  library)

(t2/define-after-delete :model/PythonLibrary [library]
  (events/publish-event! :event/python-library-delete library))
```

#### Step 3.2: Verify event registration in remote-sync
The spec-driven event system should automatically register handlers based on the spec's `:events` configuration. Verify that `register-events-for-spec!` properly handles the new PythonLibrary spec.

---

### Phase 4: Frontend - Types and Configuration

#### Step 4.1: Update RemoteSyncEntityModel type
**File**: `frontend/src/metabase-types/api/remote-sync.ts`

Add "pythonlibrary" to the entity model type:
```typescript
export type RemoteSyncEntityModel =
  | "card"
  | "dataset"
  | "metric"
  | "dashboard"
  | "collection"
  | "document"
  | "snippet"
  | "table"
  | "field"
  | "segment"
  | "measure"
  | "transform"
  | "transformtag"
  | "pythonlibrary";  // Add this
```

#### Step 4.2: Add model mutation configs
**File**: `enterprise/frontend/src/metabase-enterprise/remote_sync/middleware/model-configs.ts`

Add PythonLibrary configuration:
```typescript
{
  modelType: "pythonlibrary",
  createEndpoints: [],  // Using upsert, no separate create
  updateEndpoints: [pythonTransformLibraryApi.endpoints.updatePythonLibrary.matchFulfilled],
  deleteEndpoints: [],  // No delete endpoint currently
  invalidation: { type: InvalidationType.Always },
}
```

#### Step 4.3: Update entity display utilities (if needed)
**File**: `enterprise/frontend/src/metabase-enterprise/remote_sync/utils.ts`

May need to add icon/color mappings for pythonlibrary entity type in the AllChangesView display logic.

---

### Phase 5: Testing

#### Step 5.1: Backend unit tests
**File**: `enterprise/backend/test/metabase_enterprise/remote_sync/python_library_test.clj` (new)

Test cases:
- Serialization round-trip (export → import)
- Event publication on create/update/delete
- RemoteSyncObject tracking when setting enabled
- No tracking when setting disabled
- Export path generation

#### Step 5.2: Backend integration tests
**File**: `enterprise/backend/test/metabase_enterprise/remote_sync/impl_test.clj` (add tests)

Test cases:
- PythonLibrary included in export when transforms setting enabled
- PythonLibrary excluded from export when setting disabled
- Import creates/updates PythonLibrary correctly

#### Step 5.3: Frontend unit tests
**File**: `enterprise/frontend/src/metabase-enterprise/remote_sync/middleware/model-configs.unit.spec.ts` (if exists, add tests)

Test cases:
- PythonLibrary mutations trigger dirty state invalidation
- Correct entity type display in AllChangesView

---

## Files to Modify

### Backend (Clojure)

| File | Changes |
|------|---------|
| `enterprise/backend/src/metabase_enterprise/serialization/v2/models.clj` | Remove from excluded-models, add to appropriate models list |
| `enterprise/backend/src/metabase_enterprise/transforms_python/models/python_library.clj` | Add serdes methods, event publication |
| `enterprise/backend/src/metabase_enterprise/remote_sync/spec.clj` | Add PythonLibrary spec, export-path-segments method |
| `enterprise/backend/src/metabase_enterprise/remote_sync/events.clj` | Verify event registration (may be automatic) |

### Frontend (TypeScript)

| File | Changes |
|------|---------|
| `frontend/src/metabase-types/api/remote-sync.ts` | Add "pythonlibrary" to RemoteSyncEntityModel |
| `enterprise/frontend/src/metabase-enterprise/remote_sync/middleware/model-configs.ts` | Add PythonLibrary mutation config |
| `enterprise/frontend/src/metabase-enterprise/remote_sync/utils.ts` | Add icon/display helpers if needed |

### Tests (New)

| File | Purpose |
|------|---------|
| `enterprise/backend/test/metabase_enterprise/remote_sync/python_library_test.clj` | New test file for PythonLibrary remote-sync |

---

## Dependencies and Considerations

### Prerequisites
- Current branch already has transforms remote-sync support (based on recent commits)
- `remote-sync-transforms` setting already exists and controls transform syncing

### Risks and Mitigations
1. **Path normalization**: PythonLibrary normalizes paths to `.py` extension - ensure serialization handles this consistently
2. **Single library constraint**: Currently only `common.py` is supported - serialization should handle this gracefully
3. **No delete endpoint**: PythonLibrary API only has GET/PUT (upsert) - may need to handle deletion tracking differently

### Future Considerations
- If more library paths are supported in future, the serialization will already handle them via path-based identity
- Consider whether library deletion should be supported and how it would affect remote-sync

---

## Success Criteria

1. ✅ PythonLibrary changes are tracked in RemoteSyncObject when `remote-sync-transforms` is enabled
2. ✅ PythonLibrary exports to `python-libraries/common.yaml` during git sync export
3. ✅ PythonLibrary imports from YAML correctly during git sync import
4. ✅ Frontend shows PythonLibrary in dirty changes view
5. ✅ All existing tests pass
6. ✅ New tests for PythonLibrary remote-sync functionality pass
