# Plan: Standardize Table/Field/Database Permission Checks

## Goal

Consolidate all permission checks for Tables, Fields, and Databases through the standard `metabase.models.interface` methods rather than having ad hoc checks scattered throughout the codebase.

## Key Insight

The current `can-read?` for Table/Field conflates two distinct questions:
1. "Can I see this table exists and view its metadata?"
2. "Can I query data from this table?"

Cards handle this correctly: `can-read?` answers "can see metadata" (via collection permissions), while query execution is checked separately.

## Proposed Interface

Add a new multimethod `can-query?` to cleanly separate these concerns:

| Method | Semantics | Table/Field Implementation |
|--------|-----------|---------------------------|
| `can-read?` | Can see this exists, view metadata | data perms OR manage-table-metadata OR published-in-accessible-collection |
| `can-query?` | Can execute queries against data | `:perms/view-data` + `:perms/create-queries` |
| `can-write?` | Can modify this model | `:perms/manage-table-metadata` (EE) or superuser (OSS) |

## Current State: Ad Hoc Permission Checks

These locations have special-cased permission checks that should use the standard interface:

### Direct Permission Checks (bypass `mi/can-read?`)

| File | Lines | Current Check | Should Use |
|------|-------|---------------|------------|
| `src/metabase/search/impl.clj` | 72-80 | Duplicates view-data + create-queries check | `mi/can-read?` |
| `src/metabase/warehouse_schema_rest/api/table.clj` | 513-518 | Direct `:perms/manage-table-metadata` | `mi/can-write?` |
| `src/metabase/warehouses_rest/api.clj` | 1241-1251 | Composite schema permission | New `can-read-schema?` helper using `mi/can-read?` |
| `enterprise/.../sandbox/api/table.clj` | 62-71 | Permission elevation for sandboxed | Should work with updated `can-read?` |

### Filter Functions (should use `mi/can-read?`)

| File | Lines | Function |
|------|-------|----------|
| `enterprise/.../advanced_permissions/common.clj` | 91-111 | `filter-tables-by-data-model-perms` |
| `enterprise/.../advanced_permissions/common.clj` | 113-133 | `filter-schema-by-data-model-perms` |
| `enterprise/.../advanced_permissions/common.clj` | 135-160 | `filter-databases-by-data-model-perms` |

## Implementation Plan

### Phase 1: Add `can-query?` Multimethod

**File: `src/metabase/models/interface.clj`**

```clojure
(defmulti can-query?
  "Return whether [[metabase.api.common/*current-user*]] has permission to
   execute queries against this model's data. For Tables/Fields, this checks
   data access permissions. For Cards, this checks if the user can run the
   underlying query. Models without queryable data return false by default."
  {:arglists '([instance] [model pk])}
  dispatch-on-model)

(defmethod can-query? :default
  ([_instance] false)
  ([_model _pk] false))
```

**File: `src/metabase/warehouse_schema/models/table.clj`**

```clojure
(defmethod mi/can-query? :model/Table
  ([instance]
   (and (perms/user-has-permission-for-table?
         api/*current-user-id*
         :perms/view-data
         :unrestricted
         (:db_id instance)
         (:id instance))
        (perms/user-has-permission-for-table?
         api/*current-user-id*
         :perms/create-queries
         :query-builder
         (:db_id instance)
         (:id instance))))
  ([_ pk]
   (mi/can-query? (t2/select-one :model/Table pk))))
```

**File: `src/metabase/warehouse_schema/models/field.clj`**

```clojure
(defmethod mi/can-query? :model/Field
  ([instance]
   (and (perms/user-has-permission-for-table?
         api/*current-user-id*
         :perms/view-data
         :unrestricted
         (field->db-id instance)
         (:table_id instance))
        (perms/user-has-permission-for-table?
         api/*current-user-id*
         :perms/create-queries
         :query-builder
         (field->db-id instance)
         (:table_id instance))))
  ([model pk]
   (mi/can-query? (t2/select-one model pk))))
```

**File: `src/metabase/warehouses/models/database.clj`**

```clojure
(defmethod mi/can-query? :model/Database
  ([instance]
   (mi/can-query? :model/Database (u/the-id instance)))
  ([_model database-id]
   (contains? #{:query-builder :query-builder-and-native}
              (perms/most-permissive-database-permission-for-user
               api/*current-user-id*
               :perms/create-queries
               database-id))))
```

### Phase 2: Update `can-read?` for Metadata Visibility

Update Table/Field/Database `can-read?` to include all valid access paths:

**File: `src/metabase/warehouse_schema/models/table.clj`**

```clojure
(defmethod mi/can-read? :model/Table
  ([instance]
   (or
    ;; Path 1: Has data query permissions
    (mi/can-query? instance)
    ;; Path 2: Has manage-table-metadata permission
    (perms/user-has-permission-for-table?
     api/*current-user-id*
     :perms/manage-table-metadata
     :yes
     (:db_id instance)
     (:id instance))
    ;; Path 3: Table is published in accessible collection (EE)
    (published-tables/can-access-via-collection? instance)))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Table pk))))
```

**File: `src/metabase/warehouse_schema/models/field.clj`**

```clojure
(defmethod mi/can-read? :model/Field
  ([instance]
   (or
    ;; Path 1: Has data query permissions
    (mi/can-query? instance)
    ;; Path 2: Has manage-table-metadata permission on parent table
    (perms/user-has-permission-for-table?
     api/*current-user-id*
     :perms/manage-table-metadata
     :yes
     (field->db-id instance)
     (:table_id instance))
    ;; Path 3: Parent table is published in accessible collection
    (when-let [table (or (:table instance)
                         (t2/select-one :model/Table :id (:table_id instance)))]
      (published-tables/can-access-via-collection? table))))
  ([model pk]
   (mi/can-read? (t2/select-one model pk))))
```

**File: `src/metabase/warehouses/models/database.clj`**

Keep existing logic (already includes published table check):
```clojure
(defmethod mi/can-read? :model/Database
  ([_model database-id]
   (or (mi/can-query? :model/Database database-id)
       (perms/user-has-published-table-permission-for-database? database-id))))
```

### Phase 3: Migrate Special-Cased Checks

#### 3.1 Search Permission Check

**File: `src/metabase/search/impl.clj` (lines 72-80)**

Before:
```clojure
(defmethod check-permissions-for-model :table
  [search-ctx instance]
  (let [instance-id (:id instance)
        user-id     (:current-user-id search-ctx)
        db-id       (database/table-id->database-id instance-id)]
    (and
     (perms/user-has-permission-for-table? user-id :perms/view-data :unrestricted db-id instance-id)
     (perms/user-has-permission-for-table? user-id :perms/create-queries :query-builder db-id instance-id))))
```

After:
```clojure
(defmethod check-permissions-for-model :table
  [_search-ctx instance]
  (mi/can-read? :model/Table (:id instance)))
```

#### 3.2 Sync Schema Endpoint

**File: `src/metabase/warehouse_schema_rest/api/table.clj` (lines 513-518)**

Before:
```clojure
(api/check-403
 (perms/user-has-permission-for-table?
  api/*current-user-id*
  :perms/manage-table-metadata
  :yes
  (:id database)
  id))
```

After:
```clojure
(api/write-check :model/Table id)
```

#### 3.3 Enterprise Filter Functions

**File: `enterprise/.../advanced_permissions/common.clj`**

Update `filter-tables-by-data-model-perms` to use `mi/can-read?`:
```clojure
(defn filter-tables-by-data-model-perms
  [tables]
  (filter mi/can-read? tables))
```

Or if specifically filtering for write access:
```clojure
(defn filter-tables-by-data-model-perms
  [tables]
  (filter mi/can-write? tables))
```

### Phase 4: Add `api/query-check` Helper

**File: `src/metabase/api/common.clj`**

```clojure
(defn query-check
  "Check whether we can query data from `obj`, or `entity` with `id`.
   If the object doesn't exist, throw a 404; if we don't have permissions, throw 403."
  ([obj]
   (check-404 obj)
   (check-403 (mi/can-query? obj))
   obj)
  ([entity id]
   (query-check (t2/select-one entity :id id)))
  ([entity id & other-conditions]
   (query-check (apply t2/select-one entity :id id other-conditions))))
```

### Phase 5: Update Query Permission Checks

Places that check "can query this table" should use `mi/can-query?` or `api/query-check`:

| File | Current | After |
|------|---------|-------|
| Query processor permission middleware | Direct permission checks | `mi/can-query?` |
| Card query execution | Mix of checks | `mi/can-query?` for underlying tables |

## Files to Modify

### Core Interface
- `src/metabase/models/interface.clj` - add `can-query?` multimethod

### Model Implementations
- `src/metabase/warehouse_schema/models/table.clj` - implement `can-query?`, update `can-read?`
- `src/metabase/warehouse_schema/models/field.clj` - implement `can-query?`, update `can-read?`
- `src/metabase/warehouses/models/database.clj` - implement `can-query?`, update `can-read?`

### API Layer
- `src/metabase/api/common.clj` - add `query-check` helper

### Migration of Special Cases
- `src/metabase/search/impl.clj` - use `mi/can-read?`
- `src/metabase/warehouse_schema_rest/api/table.clj` - use standard checks
- `src/metabase/warehouses_rest/api.clj` - use standard checks
- `enterprise/.../advanced_permissions/common.clj` - use `mi/can-read?`/`mi/can-write?`
- `enterprise/.../sandbox/api/table.clj` - verify works with updated `can-read?`

## Testing Strategy

1. **Unit tests for `can-query?`** - verify correct permission checks
2. **Unit tests for updated `can-read?`** - verify all three access paths work
3. **Integration tests** - verify API endpoints behave correctly
4. **Regression tests** - ensure no permission escalation or denial

## Permission Matrix After Implementation

| User Has | `can-read?` | `can-query?` | `can-write?` |
|----------|-------------|--------------|--------------|
| Data perms (view-data + create-queries) | ✅ | ✅ | ❌ |
| Manage-table-metadata only | ✅ | ❌ | ✅ |
| Published table in accessible collection | ✅ | ❌* | ❌ |
| None of the above | ❌ | ❌ | ❌ |

*Published tables may grant query access depending on EE configuration

## Benefits

1. **Single source of truth** - all permission logic in model interface methods
2. **Semantic clarity** - `can-read?` means "see metadata", `can-query?` means "execute queries"
3. **Consistency** - matches how Cards work (collection perms for visibility, data perms for execution)
4. **Maintainability** - changes to permission logic only need to happen in one place
5. **Testability** - easier to test permission logic in isolation
