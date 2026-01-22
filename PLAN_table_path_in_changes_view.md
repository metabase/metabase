# Plan: Update Path for Table Children in Git Sync Changes View

## Problem Statement

When displaying changes in the git sync modals, fields and segments are currently grouped only by their collection (inherited from the parent table). The UI doesn't show which table these entities belong to, making it hard for users to understand the context of changes to table children.

**Current behavior:**
```
Collection: Root / Sales
  ├── orders_table (Table) [Create]
  ├── customer_id (Field) [Create]     ← No indication this belongs to orders_table
  └── active_customers (Segment) [Create]  ← No indication this belongs to orders_table
```

**Desired behavior:**
```
Collection: Root / Sales
  └── orders_table (Table) [Create]
      ├── customer_id (Field) [Create]
      └── active_customers (Segment) [Create]
```

## Implementation Plan

### Step 1: Backend - Add table_id and table_name to dirty state response

**File:** `enterprise/backend/src/metabase_enterprise/remote_sync/models/remote_sync_object.clj`

1. Update `build-select-clause` to include `table_id` for models that have it
2. Update the query to include `table_name` from the joined `metabase_table` for field and segment models
3. Add new columns to the select clause:
   - `:table_id` - The ID of the parent table (for fields/segments)
   - `:table_name` - The name of the parent table (for fields/segments)

Changes needed:
- Add `:has-table-id` configuration option to model configs
- Update `build-select-clause` to include table_id when the model has it (fields, segments)
- Add table_name from the joined metabase_table

**File:** `enterprise/backend/src/metabase_enterprise/remote_sync/schema.clj`

1. Add optional `:table_id` and `:table_name` fields to `DirtyItem` schema

### Step 2: Frontend Types - Update RemoteSyncEntity type

**File:** `frontend/src/metabase-types/api/remote-sync.ts`

1. Add `table` and `field` and `segment` to `RemoteSyncEntityModel` union type
2. Add optional `table_id?: number` field to `RemoteSyncEntity`
3. Add optional `table_name?: string` field to `RemoteSyncEntity`

### Step 3: Frontend Utils - Create table grouping utilities

**File:** `enterprise/frontend/src/metabase-enterprise/remote_sync/utils.ts`

1. Add helper function to identify table-child models:
   ```typescript
   export const isTableChildModel = (model: string): boolean => {
     return model === "field" || model === "segment";
   };
   ```

2. Add helper to get table info from entity:
   ```typescript
   export const getParentTableInfo = (entity: RemoteSyncEntity) => {
     if (isTableChildModel(entity.model) && entity.table_id) {
       return { id: entity.table_id, name: entity.table_name };
     }
     return null;
   };
   ```

### Step 4: Frontend UI - Update AllChangesView to nest table children

**File:** `enterprise/frontend/src/metabase-enterprise/remote_sync/components/ChangesLists/AllChangesView.tsx`

1. Update `groupedData` useMemo to create a two-level hierarchy:
   - First level: Group by collection (existing)
   - Second level: Within each collection, separate tables and their children from other items

2. For each collection group:
   - Identify table entities
   - Identify field/segment entities that belong to tables (via `table_id`)
   - Group fields/segments under their parent table
   - Render table items with nested children

3. Update the rendering to show:
   ```
   Collection Path
   ├── Table Item
   │   ├── Field Item
   │   └── Segment Item
   └── Other Item (Card, Dashboard, etc.)
   ```

### Step 5: Update EntityLink to handle table children rendering

**File:** `enterprise/frontend/src/metabase-enterprise/remote_sync/components/ChangesLists/EntityLink.tsx`

The EntityLink component may need minor updates to handle the nested indentation visually, or this can be handled in AllChangesView through additional styling.

### Step 6: Test mock utilities

**File:** `frontend/src/metabase-types/api/mocks/remote-sync.ts`

Update `createMockRemoteSyncEntity` to support table_id and table_name.

**File:** `frontend/test/__support__/server-mocks/remote-sync.ts`

Update mock types if needed.

### Step 7: Write tests

Add tests for:
1. Backend: dirty state query returns correct table_id/table_name for fields and segments
2. Frontend: grouping logic correctly nests fields/segments under tables
3. Frontend: UI renders nested structure correctly

## Technical Details

### Backend Query Changes

Current query for field:
```sql
SELECT field.id, field.name, ..., metabase_table.collection_id, 'field' as model
FROM metabase_field field
INNER JOIN remote_sync_object rs_obj ON ...
INNER JOIN metabase_table ON field.table_id = metabase_table.id
```

Updated query:
```sql
SELECT field.id, field.name, ...,
       metabase_table.collection_id,
       field.table_id,
       metabase_table.name as table_name,
       'field' as model
FROM metabase_field field
INNER JOIN remote_sync_object rs_obj ON ...
INNER JOIN metabase_table ON field.table_id = metabase_table.id
```

### Frontend Grouping Logic

```typescript
// Pseudocode for the grouping logic
const groupedData = useMemo(() => {
  const byCollection = _.groupBy(entities, (e) => e.collection_id || 0);

  return Object.entries(byCollection).map(([collectionId, items]) => {
    // Separate tables and their children from other items
    const tables = items.filter(i => i.model === "table");
    const tableChildren = items.filter(i => isTableChildModel(i.model));
    const otherItems = items.filter(i => i.model !== "table" && !isTableChildModel(i.model));

    // Group table children by their parent table
    const tableChildrenByTable = _.groupBy(tableChildren, (e) => e.table_id);

    // Create table items with their nested children
    const tableItems = tables.map(table => ({
      ...table,
      children: tableChildrenByTable[table.id] || []
    }));

    // Handle orphan table children (table not in dirty set)
    const orphanTableIds = Object.keys(tableChildrenByTable)
      .filter(id => !tables.some(t => t.id === Number(id)));

    const orphanTableGroups = orphanTableIds.map(tableId => ({
      tableId: Number(tableId),
      tableName: tableChildrenByTable[tableId][0]?.table_name,
      children: tableChildrenByTable[tableId]
    }));

    return {
      pathSegments: getCollectionPathSegments(...),
      collectionId,
      collectionEntity,
      tableItems,        // Tables with their children
      orphanTableGroups, // Children of tables not in dirty set
      items: otherItems  // Non-table items (cards, dashboards, etc.)
    };
  });
}, [entities, collectionMap]);
```

## Files to Modify

1. `enterprise/backend/src/metabase_enterprise/remote_sync/models/remote_sync_object.clj`
2. `enterprise/backend/src/metabase_enterprise/remote_sync/schema.clj`
3. `frontend/src/metabase-types/api/remote-sync.ts`
4. `enterprise/frontend/src/metabase-enterprise/remote_sync/utils.ts`
5. `enterprise/frontend/src/metabase-enterprise/remote_sync/components/ChangesLists/AllChangesView.tsx`
6. `frontend/src/metabase-types/api/mocks/remote-sync.ts` (optional)
7. `frontend/test/__support__/server-mocks/remote-sync.ts` (optional)

## Considerations

1. **Orphan children**: Fields/segments may be dirty without their parent table being dirty. Need to handle this case by showing a "virtual" table parent grouping using the table_name from the field/segment.

2. **Performance**: The grouping logic adds complexity but operates on already-fetched data, so impact should be minimal.

3. **Backwards compatibility**: Adding optional fields to the API response is backward compatible.

4. **UI clarity**: The nested structure should make it clearer which table fields/segments belong to, improving user understanding of changes.
