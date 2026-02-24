# Metabase Serialization/Deserialization Specification

This document describes the complete serialization (export) and deserialization (import) system used by Metabase to transfer content between instances. It is written so that an engineer can implement it fully and correctly in TypeScript.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Entity Identity System](#2-entity-identity-system)
3. [Paths and Serdes Metadata](#3-paths-and-serdes-metadata)
4. [The Make-Spec Blueprint System](#4-the-make-spec-blueprint-system)
5. [Transformer System](#5-transformer-system)
6. [Foreign Key Resolution](#6-foreign-key-resolution)
7. [MBQL Transformation](#7-mbql-transformation)
8. [Parameters Transformation](#8-parameters-transformation)
9. [Visualization Settings Transformation](#9-visualization-settings-transformation)
10. [Result Metadata Transformation](#10-result-metadata-transformation)
11. [Document Content Transformation](#11-document-content-transformation)
12. [Nested Entity Handling](#12-nested-entity-handling)
13. [Dependency System](#13-dependency-system)
14. [Descendants System (Export)](#14-descendants-system-export)
15. [Export Pipeline](#15-export-pipeline)
16. [Ingestion System](#16-ingestion-system)
17. [Import (Load) Pipeline](#17-import-load-pipeline)
18. [Circular Dependency Handling](#18-circular-dependency-handling)
19. [Storage Format](#19-storage-format)
20. [Complete Entity Specs](#20-complete-entity-specs)
21. [End-to-End Example](#21-end-to-end-example)

---

## 1. Architecture Overview

The system has two main phases:

- **Export**: Database entities -> in-memory maps with portable references -> YAML files -> tar.gz archive
- **Import**: tar.gz archive -> YAML files -> in-memory maps -> resolve references -> insert/update database

Key design principles:
- All numeric database IDs are converted to **portable references** (entity IDs, names, or path arrays)
- Every serializable entity carries a `:serdes/meta` path describing its logical location
- Dependencies are tracked so entities are loaded in correct order
- Entities are matched across instances using `entity_id` (21-char NanoID) or `identity-hash` (8-char hex)

---

## 2. Entity Identity System

### 2.1 Three Identification Approaches

| Approach | Used By | Format | Example |
|----------|---------|--------|---------|
| Natural unique name | Database, Table, Field, Schema | The name field itself | `"My Database"` |
| Entity ID column | Card, Dashboard, Collection, etc. | 21-char NanoID | `"V1StGXR8_Z5jdHi6B-myT"` |
| Inlined/embedded | DashboardCard, DashboardTab, etc. | No independent identity; nested in parent | N/A |

### 2.2 Entity ID Format

- **NanoID**: 21-character string matching regex `^[A-Za-z0-9_-]{21}$`
- Generated on entity insert via database hook
- Can be backfilled using identity-hash seeded PRNG for consistency across instances

### 2.3 Identity Hash

- **Format**: 8-character hex string matching regex `^[0-9a-fA-F]{8}$`
- Computed from entity's identifying fields (via `hash-fields` multimethod)
- Used as fallback when `entity_id` is missing
- Example: Card's hash is computed from `[name, collection_id, database_id]`

### 2.4 ID Detection

```typescript
function isEntityId(id: string): boolean {
  return /^[A-Za-z0-9_-]{21}$/.test(id);
}

function isIdentityHash(id: string): boolean {
  return /^[0-9a-fA-F]{8}$/.test(id);
}

function isPortableId(id: string): boolean {
  return isEntityId(id) || isIdentityHash(id);
}
```

### 2.5 Lookup by ID

When resolving a portable ID to a local entity:
1. If `isEntityId(id)` → look up by `entity_id` column
2. If `isIdentityHash(id)` → compute identity hash for all entities of that model, find match

---

## 3. Paths and Serdes Metadata

### 3.1 Path Structure

Paths are **logical hierarchies** (not filesystem paths). They are arrays of objects from root to leaf:

```typescript
type PathSegment = {
  model: string;    // e.g. "Card", "Dashboard", "Database"
  id: string;       // entity_id, identity-hash, or natural key
  label?: string;   // slugified human-readable name (for filesystem)
};

type SerdesPath = PathSegment[];
```

### 3.2 Examples

```typescript
// Simple top-level entity
[{ model: "Dashboard", id: "abc123nanoid4567890", label: "my_dashboard" }]

// Nested entity (Field in Table in Schema in Database)
[
  { model: "Database", id: "my_db" },
  { model: "Schema",   id: "PUBLIC" },
  { model: "Table",    id: "Users" },
  { model: "Field",    id: "email" }
]
```

### 3.3 Path Generation

Default behavior for most entities:
```typescript
function generatePath(modelName: string, entity: Entity): SerdesPath {
  return [{
    model: modelName,
    id: entity.entity_id || identityHash(entity),
    label: entity.name ? slugify(entity.name) : undefined
  }];
}
```

Special cases:
- **Database**: `[{ model: "Database", id: name }]`
- **Table**: `[{ model: "Database", id: db.name }, { model: "Schema", id: schema }, { model: "Table", id: name }]`
- **Field**: `[...tablePath, { model: "Field", id: name }]`
- **Collection**: path includes parent collection hierarchy

### 3.4 Every Serialized Entity Contains

```typescript
interface SerializedEntity {
  "serdes/meta": SerdesPath;
  [key: string]: any; // all other fields
}
```

---

## 4. The Make-Spec Blueprint System

Every serializable model defines a spec that controls how it is exported/imported.

### 4.1 Spec Structure

```typescript
interface SerdesSpec {
  copy: string[];                        // Fields copied as-is
  skip: string[];                        // Fields to ignore entirely
  transform: Record<string, Transformer>; // Fields needing transformation
  coerce?: Record<string, MalliSchema>;  // Optional Malli schemas for coercion
}
```

**Important invariant**: Every column in the model's database table must appear in exactly one of `copy`, `skip`, or `transform`. Tests verify this.

### 4.2 How Specs Drive Export

```typescript
function extractOne(modelName: string, entity: DbEntity): SerializedEntity {
  const spec = makeSpec(modelName);
  const result: any = {};

  // 1. Copy fields verbatim
  for (const field of spec.copy) {
    result[field] = entity[field];
  }

  // 2. Apply transforms
  for (const [field, transformer] of Object.entries(spec.transform)) {
    const outputKey = transformer.as || field;
    const value = entity[field];

    let exported;
    if (transformer.exportWithContext) {
      exported = transformer.exportWithContext(entity, field, value);
    } else if (transformer.export) {
      exported = transformer.export(value);
    }

    if (exported !== SKIP) {
      result[outputKey] = exported;
    }
  }

  // 3. Attach path
  result["serdes/meta"] = generatePath(modelName, entity);

  return result;
}
```

### 4.3 How Specs Drive Import

```typescript
function transformIngested(modelName: string, ingested: SerializedEntity): DbEntity {
  const spec = makeSpec(modelName);
  const result: any = {};

  // 1. Copy fields verbatim
  for (const field of spec.copy) {
    result[field] = ingested[field];
  }

  // 2. Apply import transforms (skip nested transforms - handled separately)
  for (const [field, transformer] of Object.entries(spec.transform)) {
    if (transformer.isNested) continue;
    if (ingested["serdes/strip"]?.includes(field)) continue;

    const inputKey = transformer.as || field;
    const value = ingested[inputKey];

    let imported;
    if (transformer.importWithContext) {
      imported = transformer.importWithContext(ingested, field, value);
    } else if (transformer.import) {
      imported = transformer.import(value);
    }

    if (imported !== SKIP && (imported != null || inputKey in ingested)) {
      result[field] = imported;
    }
  }

  // 3. Apply coercions
  if (spec.coerce) {
    for (const [field, schema] of Object.entries(spec.coerce)) {
      if (field in result) {
        result[field] = coerce(result[field], schema);
      }
    }
  }

  return result;
}
```

---

## 5. Transformer System

### 5.1 Transformer Interface

```typescript
interface Transformer {
  export?: (value: any) => any;
  import?: (value: any) => any;
  exportWithContext?: (entity: any, key: string, value: any) => any;
  importWithContext?: (entity: any, key: string, value: any) => any;
  as?: string;           // Store under different key
  isFk?: boolean;        // Is this a foreign key transform?
  isNested?: boolean;     // Is this a nested entity transform?
}
```

### 5.2 Built-in Transformers

#### `date`
```typescript
const dateTransformer: Transformer = {
  export: (value) => formatDate(value),  // ISO 8601 string
  import: (value) => typeof value === "string" ? parseDate(value) : value,
};
```

#### `kw` (keyword)
```typescript
const kwTransformer: Transformer = {
  export: (value) => value,       // keyword → string name (no namespace)
  import: (value) => value,       // string → keyword
};
```

#### `optionalKw`
```typescript
const optionalKwTransformer: Transformer = {
  export: (value) => value || null,
  import: (value) => value || null,
};
```

#### `parentRef`
Used for fields that reference the parent entity in nested relationships:
```typescript
const parentRefTransformer: Transformer = {
  isFk: true,
  export: () => SKIP,   // Omitted from export (parent handles it)
  import: (value) => value, // Passed through on import (parent sets it)
};
```

#### `fk(model, fieldName?)`
See [Section 6: Foreign Key Resolution](#6-foreign-key-resolution).

#### `nested(model, backwardFk, opts?)`
See [Section 12: Nested Entity Handling](#12-nested-entity-handling).

#### `compose(innerTransform, outerTransform)`
Chains two transformers: export applies inner then outer; import applies outer then inner.

---

## 6. Foreign Key Resolution

Foreign keys are the most critical part of serialization. Every numeric FK must be converted to a portable form during export and resolved back during import.

### 6.1 General FK (`fk(model)`)

**Export**: Numeric ID → entity_id string (or identity-hash)
```typescript
function exportFk(id: number, model: string): string | string[] | null {
  if (id == null) return null;
  const entity = db.selectOne(model, { id });
  if (!entity) throw new Error(`FK target not found: ${model} ${id}`);
  const path = generatePath(model, entity).map(seg => seg.id);
  return path.length === 1 ? path[0] : path;
}
```

**Import**: entity_id string → Numeric ID
```typescript
function importFk(eid: string | string[], model: string): number | null {
  if (eid == null) return null;
  const id = Array.isArray(eid) ? eid[eid.length - 1] : eid;
  const entity = lookupById(model, id);
  if (!entity) throw new Error(`Could not find FK target: ${model} ${id}`);
  return entity.id;
}
```

### 6.2 Keyed FK (`fk(model, fieldName)`)

Used when the lookup should use a specific field instead of entity_id.

**Export**: `(id: number) => db.selectOneField(model, fieldName, { id })`
**Import**: `(value: any) => db.selectOnePk(model, { [fieldName]: value })`

Example: `fk(:model/Database, :name)` → exports database ID as its name string.

### 6.3 User FK

**Export**: `(userId: number) => user.email`
**Import**: `(email: string) => findOrCreateInactiveUser(email).id`

Users are exported as email addresses. On import, if the user doesn't exist, an inactive user is synthesized.

### 6.4 Table FK

**Export**: `(tableId: number) => [dbName, schema, tableName]`
```typescript
function exportTableFk(tableId: number): [string, string | null, string] | null {
  if (tableId == null) return null;
  const table = db.selectOne("Table", { id: tableId });
  const dbName = db.selectOneField("Database", "name", { id: table.db_id });
  return [dbName, table.schema, table.name];
}
```

**Import**: `([dbName, schema, tableName]) => table.id`
```typescript
function importTableFk([dbName, schema, tableName]: [string, string | null, string]): number {
  const dbId = db.selectOnePk("Database", { name: dbName });
  if (!dbId) throw new Error(`Database not found: ${dbName}`);
  const tableId = db.selectOnePk("Table", { name: tableName, schema, db_id: dbId });
  if (!tableId) throw new Error(`Table not found: ${tableName}`);
  return tableId;
}
```

### 6.5 Field FK

**Export**: `(fieldId: number) => [dbName, schema, tableName, fieldName1, fieldName2, ...]`

Handles field hierarchies (parent fields):
```typescript
function exportFieldFk(fieldId: number): string[] | null {
  if (fieldId == null) return null;
  const fields = fieldHierarchy(fieldId); // walks parent_id chain
  const [dbName, schema, tableName] = exportTableFk(fields[0].table_id);
  return [dbName, schema, tableName, ...fields.map(f => f.name)];
}
```

**Import**: `([dbName, schema, tableName, ...fieldNames]) => field.id`
```typescript
function importFieldFk([dbName, schema, tableName, ...fieldNames]: string[]): number {
  const tableId = importTableFk([dbName, schema, tableName]);
  // Walk field hierarchy from bottom up
  return recursivelyFindField(tableId, fieldNames.reverse());
}
```

### 6.6 Caching

All FK functions are memoized during export/import operations. This is critical for performance since the same FK lookups happen thousands of times.

```typescript
// Wrap all FK functions in memoization during serialization
function withCache<T>(fn: () => T): T {
  const cache = new Map();
  // Bind memoized versions of all FK functions
  return withMemoizedFkFunctions(cache, fn);
}
```

---

## 7. MBQL Transformation

MBQL (Metabase Query Language) expressions contain numeric IDs for fields, tables, databases, cards, segments, and snippets. All must be converted to portable forms.

### 7.1 Export MBQL (`exportMbql`)

Recursively walks the MBQL expression and replaces:

| Pattern | Replacement |
|---------|-------------|
| `[:field (int)id nil]` | `[:field [db, schema, table, field] nil]` |
| `[:field (int)id opts]` | `[:field [db, schema, table, field] (recurse opts)]` |
| `{:database (int)id}` | `{:database "database_name"}` (or `"database/__virtual"` for saved-question virtual DB) |
| `{:source-table (int)id}` | `{:source-table [db, schema, table]}` |
| `{:source-table "card__123"}` | `{:source-table "entity_id_of_card"}` |
| `{:card_id (int)id}` or `{:card-id (int)id}` | `{:card_id "entity_id"}` |
| `{:segment (int)id}` | `{:segment "entity_id"}` |
| `{:snippet-id (int)id}` | `{:snippet-id "entity_id"}` |
| `[:metric (int)id]` | `[:metric "entity_id_of_card"]` |
| `[:segment (int)id]` | `[:segment "entity_id"]` |
| `[:measure (int)id]` | `[:measure "entity_id"]` |
| `{:source-field (int)id}` | `{:source-field [db, schema, table, field]}` |
| `{::mb.viz/param-mapping-source (int)id}` | `{::mb.viz/param-mapping-source [db, schema, table, field]}` |

### 7.2 Import MBQL (`importMbql`)

Exact inverse of export:

| Pattern | Replacement |
|---------|-------------|
| `[:field [db, schema, table, field] opts]` | `[:field (int)importFieldFk(...) (recurse opts)]` |
| `{:database "name"}` | `{:database (int)dbId}` (or virtual DB constant) |
| `{:source-table [db, schema, table]}` | `{:source-table (int)importTableFk(...)}` |
| `{:source-table "entity_id"}` | `{:source-table "card__123"}` (resolved card ID) |
| `{:card-id "entity_id"}` | `{:card-id (int)importFk(..., Card)}` |
| `{:snippet-id "entity_id"}` | `{:snippet-id (int)importFk(..., NativeQuerySnippet)}` |
| `[:metric "entity_id"]` | `[:metric (int)importFk(..., Card)]` |
| `[:segment "entity_id"]` | `[:segment (int)importFk(..., Segment)]` |
| `[:measure "entity_id"]` | `[:measure (int)importFk(..., Measure)]` |

### 7.3 Walk Strategy

The MBQL walker uses pattern matching with separate handlers for:
- **Vectors**: Match MBQL clause patterns (`:field`, `:metric`, `:segment`, etc.)
- **Maps**: Check specific keys (`:database`, `:source-table`, `:card_id`, etc.) and recurse on values
- **Scalars**: Pass through unchanged

```typescript
function idsToFullyQualifiedNames(node: any): any {
  if (Array.isArray(node)) {
    if (isMbqlEntityReference(node)) {
      return mbqlIdToFullyQualifiedName(node);
    }
    return node.map(idsToFullyQualifiedNames);
  }

  if (isPlainObject(node)) {
    const result: any = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "database" && typeof value === "number") {
        result[key] = value === VIRTUAL_DB_ID ? "database/__virtual" : exportFkKeyed(value, "Database", "name");
      } else if (key === "source-table" || key === "source_table") {
        result[key] = exportSourceTable(value);
      } else if ((key === "card_id" || key === "card-id") && typeof value === "number") {
        result[key] = exportFk(value, "Card");
      } else if (key === "segment" && typeof value === "number") {
        result[key] = exportFk(value, "Segment");
      } else if (key === "snippet-id" && typeof value === "number") {
        result[key] = exportFk(value, "NativeQuerySnippet");
      } else {
        result[key] = idsToFullyQualifiedNames(value);
      }
    }
    return result;
  }

  return node;
}
```

### 7.4 MBQL 5 (pMBQL) Handling

If the query has a `:lib/type` key, it is in the newer MBQL 5 / pMBQL format. It must be converted to legacy MBQL before serialization. The import always produces legacy MBQL.

---

## 8. Parameters Transformation

### 8.1 Export Parameters

```typescript
function exportParameters(parameters: Parameter[]): Parameter[] {
  return parameters
    .sort((a, b) => (a.id || "").localeCompare(b.id || ""))
    .map(param => idsToFullyQualifiedNames(param));
}
```

Sorting by `id` ensures stable output.

### 8.2 Import Parameters

```typescript
function importParameters(parameters: Parameter[]): Parameter[] {
  return parameters.map(param => {
    const imported = mbqlFullyQualifiedNamesToIds(param);
    if (imported.values_source_config?.card_id) {
      imported.values_source_config.card_id = importFk(
        imported.values_source_config.card_id, "Card"
      );
    }
    return imported;
  });
}
```

### 8.3 Export Parameter Mappings

```typescript
function exportParameterMappings(mappings: ParameterMapping[]): ParameterMapping[] {
  return mappings
    .sort((a, b) => (a.parameter_id || "").localeCompare(b.parameter_id || ""))
    .map(mapping => idsToFullyQualifiedNames(mapping));
}
```

### 8.4 Import Parameter Mappings

```typescript
function importParameterMappings(mappings: ParameterMapping[]): ParameterMapping[] {
  return mappings.map(mapping => {
    const imported = mbqlFullyQualifiedNamesToIds(mapping);
    if (imported.card_id) {
      imported.card_id = importFk(imported.card_id, "Card");
    }
    return imported;
  });
}
```

### 8.5 Parameter Dependencies

```typescript
function parametersDeps(parameters: Parameter[]): Set<SerdesPath> {
  const deps = new Set<SerdesPath>();
  for (const param of parameters || []) {
    if (param.values_source_type === "card") {
      const config = param.values_source_config;
      deps.add([{ model: "Card", id: config.card_id }]);
      if (config.value_field) {
        for (const dep of mbqlDepsVector(config.value_field)) {
          deps.add(dep);
        }
      }
    }
  }
  return deps;
}
```

---

## 9. Visualization Settings Transformation

Visualization settings are complex nested structures containing field references, click behavior targets, and more.

### 9.1 Export Pipeline

```typescript
function exportVisualizationSettings(settings: VizSettings): VizSettings {
  if (!settings) return settings;
  return pipe(settings,
    exportVisualizations,       // Field ID references
    exportVizLinkCard,          // Link card entity references
    exportVizClickBehavior,     // Click behavior targets
    exportVisualizerSettings,   // Visualizer card references
    exportPivotTable,           // Pivot table field refs
    (s) => ({ ...s, column_settings: exportColumnSettings(s.column_settings) })
  );
}
```

### 9.2 `exportVisualizations` - Field References

Recursively walks the settings structure and replaces field references:

| Pattern | Replacement |
|---------|-------------|
| `["field-id", 123]` | `["field-id", [db, schema, table, field]]` |
| `[:field-id, 123]` | `[:field-id, [db, schema, table, field]]` |
| `["field", 123]` | `["field", [db, schema, table, field]]` |
| `[:field, 123]` | `[:field, [db, schema, table, field]]` |
| `["field", 123, tail]` | `["field", [db, schema, table, field], recurse(tail)]` |

### 9.3 `exportVizLinkCard` - Link Card References

```typescript
function exportVizLinkCard(settings: VizSettings): VizSettings {
  const entity = settings?.link?.entity;
  if (!entity) return settings;

  const touccanModel = linkCardModelToToucanModel[entity.model];
  // "card"/"dataset"/"question" → Card, "collection" → Collection, etc.

  if (touccanModel === "Table") {
    return assocIn(settings, ["link", "entity", "id"], exportTableFk(entity.id));
  }
  if (touccanModel === "Database") {
    return assocIn(settings, ["link", "entity", "id"], exportFkKeyed(entity.id, "Database", "name"));
  }
  return assocIn(settings, ["link", "entity", "id"], exportFk(entity.id, touccanModel));
}
```

Model mapping:
```typescript
const linkCardModelToToucanModel: Record<string, string> = {
  "card": "Card", "dataset": "Card", "question": "Card",
  "collection": "Collection", "database": "Database",
  "dashboard": "Dashboard", "table": "Table",
};
```

### 9.4 `exportVizClickBehavior` - Click Targets

```typescript
function exportVizClickBehavior(settings: VizSettings): VizSettings {
  if (!settings?.click_behavior) return settings;

  let result = { ...settings };

  // Export link target
  const cb = result.click_behavior;
  if (cb.type === "link") {
    if (cb.linkType === "dashboard") {
      cb.targetId = exportFk(cb.targetId, "Dashboard");
    } else if (cb.linkType === "card" || cb.linkType === "question") {
      cb.targetId = exportFk(cb.targetId, "Card");
    }
    if (cb.tabId) {
      cb.tabId = exportFk(cb.tabId, "DashboardTab");
    }
  }

  // Export parameter mappings within click behavior
  if (cb.parameterMapping) {
    const newMapping: Record<string, any> = {};
    for (const [jsonKey, value] of Object.entries(cb.parameterMapping)) {
      const parsedKey = JSON.parse(jsonKey);
      const exportedKey = JSON.stringify(idsToFullyQualifiedNames(parsedKey));
      newMapping[exportedKey] = exportVizClickBehaviorMapping(value);
    }
    cb.parameterMapping = newMapping;
  }

  return result;
}
```

### 9.5 `exportVisualizerSettings` - Card References in Visualizer

Handles patterns like `"card:123"` in source IDs and `"$_card:123_fieldname"` in column value mappings:

```typescript
// "card:123" → "card:entity_id"
// "$_card:123_name" → "$_card:entity_id_name"
```

### 9.6 `exportPivotTable` - Pivot Field References

```typescript
function exportPivotTable(settings: VizSettings): VizSettings {
  const columnSplit = settings?.pivot_table?.column_split;
  if (!columnSplit) return settings;

  return {
    ...settings,
    pivot_table: {
      ...settings.pivot_table,
      column_split: {
        rows: columnSplit.rows?.map(exportVisualizations),
        columns: columnSplit.columns?.map(exportVisualizations),
        values: columnSplit.values?.map(exportVisualizations),
      }
    }
  };
}
```

### 9.7 `exportColumnSettings` - Column Setting Keys

Column settings use JSON-encoded MBQL as keys:
```typescript
function exportColumnSettings(columnSettings: Record<string, any>): Record<string, any> {
  if (!columnSettings) return columnSettings;

  const result: Record<string, any> = {};
  for (const [jsonKey, value] of Object.entries(columnSettings)) {
    const parsed = JSON.parse(jsonKey);
    const exported = idsToFullyQualifiedNames(parsed);
    const newKey = JSON.stringify(exported);
    result[newKey] = exportVizClickBehavior(value);
  }
  return result;
}
```

### 9.8 Import Pipeline

Exact inverse of export:
```typescript
function importVisualizationSettings(settings: VizSettings): VizSettings {
  if (!settings) return settings;
  return pipe(settings,
    importVisualizations,
    importVizLinkCard,
    importVizClickBehavior,
    importVisualizerSettings,
    importPivotTable,
    (s) => ({ ...s, column_settings: importColumnSettings(s.column_settings) })
  );
}
```

---

## 10. Result Metadata Transformation

Cards store result metadata - column information from query results.

### 10.1 Export

```typescript
function exportResultMetadata(metadata: ResultMetadataColumn[]): ResultMetadataColumn[] {
  if (!metadata) return metadata;
  return metadata.map(col => {
    const result = { ...col };
    delete result.fingerprint; // Not serialized

    if (result.table_id != null) {
      result.table_id = exportTableFk(result.table_id);
    }
    if (result.id != null) {
      result.id = exportFieldFk(result.id);
    }
    if (result.field_ref != null) {
      result.field_ref = exportMbql(result.field_ref);
    }
    if (result.fk_target_field_id != null) {
      result.fk_target_field_id = exportFieldFk(result.fk_target_field_id);
    }
    return result;
  });
}
```

### 10.2 Import

```typescript
function importResultMetadata(metadata: ResultMetadataColumn[]): ResultMetadataColumn[] {
  if (!metadata) return metadata;
  return metadata.map(col => {
    const result = { ...col };
    if (result.table_id != null) {
      result.table_id = importTableFk(result.table_id);
    }
    if (result.id != null) {
      result.id = importFieldFk(result.id);
    }
    if (result.field_ref != null) {
      result.field_ref = importMbql(result.field_ref);
    }
    if (result.fk_target_field_id != null) {
      // Handle both legacy numeric and portable forms
      result.fk_target_field_id = typeof result.fk_target_field_id === "number"
        ? result.fk_target_field_id
        : importFieldFk(result.fk_target_field_id);
    }
    return result;
  });
}
```

---

## 11. Document Content Transformation

Documents use ProseMirror AST format. Smart links and card embeds contain entity references.

### 11.1 Export

Walk the ProseMirror AST and replace numeric IDs with portable references:

```typescript
function exportDocumentContent(document: Document, key: string): any {
  if (document.content_type !== "application/prosemirror") {
    return document[key];
  }

  return updateAst(document, (node) => {
    if (node.type === "smartLink" || node.type === "cardEmbed") {
      return true;
    }
    return false;
  }, (node) => {
    // Convert numeric IDs to serdes paths
    const idKey = node.type === "smartLink" ? "entityId" : "id";
    const model = astModelToDbModel[node.attrs.model]; // "card" → "Card", etc.
    const entityId = exportFk(node.attrs[idKey], model);
    return { ...node, attrs: { ...node.attrs, [idKey]: [{ model, id: entityId }] } };
  });
}
```

### 11.2 Import

```typescript
function importDocumentContent(document: any, key: string): any {
  // Walk AST, resolve portable references back to local IDs
  return updateAst(document, isSmartLinkOrEmbed, (node) => {
    const idKey = node.type === "smartLink" ? "entityId" : "id";
    const localEntity = loadFindLocal(node.attrs[idKey]);
    if (localEntity) {
      return { ...node, attrs: { ...node.attrs, [idKey]: localEntity.id } };
    }
    console.warn("Model not found at path", node.attrs[idKey]);
    return node;
  });
}
```

---

## 12. Nested Entity Handling

Some entities are inlined into their parent rather than being serialized independently.

### 12.1 Nested Entities List

| Parent | Nested Model | Backward FK |
|--------|-------------|-------------|
| Dashboard | DashboardTab | `dashboard_id` |
| Dashboard | DashboardCard | `dashboard_id` |
| Field | Dimension | `field_id` |
| Timeline | TimelineEvent | `timeline_id` |
| Action | QueryAction | `action_id` |
| Action | HTTPAction | `action_id` |
| Action | ImplicitAction | `action_id` |
| DashboardCard | DashboardCardSeries | `dashboardcard_id` |
| Transform | TransformTransformTag | `transform_id` |

### 12.2 Export (Nested)

```typescript
function exportNested(entity: any, model: string, backwardFk: string, opts: any): any[] {
  const children = db.select(model, { [backwardFk]: entity.id });
  const sorted = children.sort((a, b) => compareDates(a.created_at, b.created_at));
  return sorted.map(child => extractOne(model, child));
}
```

The nested entities appear as arrays in the parent's serialized form.

### 12.3 Import (Nested)

Nested import is handled AFTER the parent entity is inserted/updated:

```typescript
function importNested(
  parentInstance: any,
  key: string,
  ingestedList: any[],
  model: string,
  backwardFk: string,
): void {
  const parentId = parentInstance.id;

  if (!ingestedList || ingestedList.length === 0) {
    // Delete all existing nested entities
    db.delete(model, { [backwardFk]: parentId });
    return;
  }

  const firstEid = ingestedList[0]?.entity_id;

  // Enrich each ingested entity with parent reference
  const enrich = (ingested: any) => ({
    ...ingested,
    [backwardFk]: parentId,
    "serdes/meta": ingested["serdes/meta"] || [{ model, id: ingested.entity_id }],
  });

  if (firstEid == null) {
    // No entity IDs - drop old, insert all new
    db.delete(model, { [backwardFk]: parentId });
    for (const ingested of ingestedList) {
      loadOne(enrich(ingested), null);
    }
  } else if (isEntityId(firstEid)) {
    // Match by entity_id
    const incomingIds = new Set(ingestedList.map(i => i.entity_id));
    db.delete(model, { [backwardFk]: parentId, entity_id: { notIn: [...incomingIds] } });
    for (const ingested of ingestedList) {
      const local = db.selectOne(model, { entity_id: ingested.entity_id });
      loadOne(enrich(ingested), local);
    }
  } else {
    // Match by identity hash
    const localsByHash = indexBy(
      db.select(model, { [backwardFk]: parentId }),
      identityHash
    );
    const incomingHashes = new Set(ingestedList.map(i => entityId(model, i)));
    // Delete entities not in incoming set
    const toDelete = Object.entries(localsByHash)
      .filter(([hash]) => !incomingHashes.has(hash))
      .map(([, entity]) => entity.id);
    db.delete(model, { id: { in: toDelete } });
    // Load each
    for (const ingested of ingestedList) {
      const hash = entityId(model, ingested);
      loadOne(enrich(ingested), localsByHash[hash] || null);
    }
  }
}
```

---

## 13. Dependency System

Before loading an entity, all its dependencies must be loaded first.

### 13.1 Dependency Interface

```typescript
function dependencies(ingested: SerializedEntity): Set<SerdesPath> {
  // Returns set of serdes/meta paths this entity depends on
}
```

### 13.2 Dependency Sources by Model

#### Card Dependencies
- `database_id` → Database
- `table_id` → Table (via `table->path`)
- `collection_id` → Collection
- `source_card_id` → Card
- `dashboard_id` → Dashboard
- `document_id` → Document
- `dataset_query` → all MBQL deps (fields, tables, databases, snippets, segments)
- `parameters` → parameter deps (cards with `values_source_type = "card"`)
- `parameter_mappings` → MBQL deps
- `result_metadata` → table, field, field_ref deps
- `visualization_settings` → viz settings deps (link cards, click behaviors, column settings)

#### Dashboard Dependencies
- `collection_id` → Collection
- Each DashboardCard's `card_id` → Card
- Each DashboardCard's `action_id` → Action
- Each DashboardCard's `parameter_mappings` → MBQL deps
- Each DashboardCard's `visualization_settings` → viz settings deps
- Dashboard `parameters` → parameter deps

#### Collection Dependencies
- Parent collection (via `location`)
- `workspace_id` → Workspace

#### Other Models
Most models depend on:
- `collection_id` → Collection (if present)
- `table_id` → Table (if present)
- `creator_id` → User (if present)
- MBQL fields in `definition` → field/table deps

### 13.3 MBQL Dependency Extraction

```typescript
function mbqlDeps(entity: any): Set<SerdesPath> {
  if (isPlainObject(entity)) return mbqlDepsMap(entity);
  if (Array.isArray(entity)) return mbqlDepsVector(entity);
  return new Set();
}

function mbqlDepsVector(entity: any[]): Set<SerdesPath> {
  // Match patterns:
  // [:field [db, schema, table, field]] → fieldToPath(...)
  // [:field [db, schema, table, field] tail] → fieldToPath(...) + mbqlDepsMap(tail)
  // [:metric "entity_id"] → [{model: "Card", id: ...}]
  // [:segment "entity_id"] → [{model: "Segment", id: ...}]
  // [:measure "entity_id"] → [{model: "Measure", id: ...}]
  // else: recurse into all elements
}

function mbqlDepsMap(entity: Record<string, any>): Set<SerdesPath> {
  const deps = new Set<SerdesPath>();
  for (const [key, value] of Object.entries(entity)) {
    if (key === "database" && typeof value === "string" && value !== "database/__virtual") {
      deps.add([{ model: "Database", id: value }]);
    } else if (key === "source-table" && Array.isArray(value)) {
      deps.add(tableToPath(value));
    } else if (key === "source-table" && isPortableId(value)) {
      deps.add([{ model: "Card", id: value }]);
    } else if (key === "source-field" && Array.isArray(value)) {
      deps.add(fieldToPath(value));
    } else if (key === "snippet-id" && isPortableId(value)) {
      deps.add([{ model: "NativeQuerySnippet", id: value }]);
    } else if ((key === "card_id" || key === "card-id") && typeof value === "string") {
      deps.add([{ model: "Card", id: value }]);
    } else if (isPlainObject(value)) {
      for (const dep of mbqlDepsMap(value)) deps.add(dep);
    } else if (Array.isArray(value)) {
      for (const dep of mbqlDepsVector(value)) deps.add(dep);
    }
  }
  return deps;
}
```

### 13.4 Path Conversion Helpers

```typescript
function tableToPath([dbName, schema, tableName]: [string, string | null, string]): SerdesPath {
  const path: PathSegment[] = [{ model: "Database", id: dbName }];
  if (schema) path.push({ model: "Schema", id: schema });
  path.push({ model: "Table", id: tableName });
  return path;
}

function fieldToPath([dbName, schema, tableName, ...fieldNames]: string[]): SerdesPath {
  const path: PathSegment[] = [{ model: "Database", id: dbName }];
  if (schema) path.push({ model: "Schema", id: schema });
  path.push({ model: "Table", id: tableName });
  for (const fieldName of fieldNames) {
    path.push({ model: "Field", id: fieldName });
  }
  return path;
}
```

---

## 14. Descendants System (Export)

Used during export to find all entities that should be included when exporting a target.

```typescript
function descendants(modelName: string, id: number): Map<[string, number], Record<string, number>> {
  // Returns map of {[model, id] → {sourceModel: sourceId, ...}}
}
```

### Dashboard Descendants
- All DashboardCards → their referenced Cards
- DashboardCardSeries → their Cards
- Actions referenced by DashboardCards
- Viz settings descendants (link cards, click behavior targets)
- Parameter source cards

### Collection Descendants
- All child collections (recursive)
- All Cards in collection
- All Dashboards in collection
- All Documents in collection
- All Timelines in collection

---

## 15. Export Pipeline

```
User initiates export
  → resolveTargets(targets or userId)
  → for each target, recursively call descendants()
  → for each model:
      extractAll(model, opts)
        → extractQuery(model, opts)  // DB select
        → extractOne(model, entity)  // Apply spec transforms
  → store!(entities, rootDir)
      → for each entity:
          compute storagePath(entity)
          write YAML file
      → write settings.yaml (all settings combined)
  → compress to .tar.gz
```

---

## 16. Ingestion System

### 16.1 Ingestable Interface

```typescript
interface Ingestable {
  ingestList(): SerdesPath[];        // All available entity paths
  ingestOne(path: SerdesPath): SerializedEntity | null;  // Read single entity
}
```

### 16.2 YAML Ingestion

```typescript
class YamlIngestion implements Ingestable {
  private rootDir: string;
  private settings: Record<string, any>;
  private cache: Map<string, [SerdesPath, File]>;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.settings = readYamlFile(path.join(rootDir, "settings.yaml"));
    this.cache = null; // Lazy-loaded
  }

  ingestList(): SerdesPath[] {
    if (!this.cache) this.cache = ingestAll(this.rootDir);
    return [
      ...this.cache.keys(),
      ...Object.keys(this.settings).map(k => [{ model: "Setting", id: k }])
    ];
  }

  ingestOne(path: SerdesPath): SerializedEntity | null {
    if (!this.cache) this.cache = ingestAll(this.rootDir);

    if (path.every(s => s.model === "Setting")) {
      const key = path[0].id;
      return this.settings[key] != null
        ? { "serdes/meta": path, key, value: this.settings[key] }
        : null;
    }

    const stripped = stripLabels(path);
    const entry = this.cache.get(stripped);
    if (!entry) return null;

    return ingestFile(entry[1]); // Parse YAML file
  }
}
```

### 16.3 File Parsing

```typescript
function ingestFile(file: string): SerializedEntity {
  const entity = parseYaml(file);
  // Convert string timestamps to Date objects
  for (const key of Object.keys(entity)) {
    if (key.endsWith("_at") || key === "last_analyzed") {
      if (typeof entity[key] === "string") {
        entity[key] = parseDate(entity[key]);
      }
    }
  }
  return entity;
}
```

---

## 17. Import (Load) Pipeline

### 17.1 Entry Point

```typescript
function loadMetabase(ingestion: Ingestable, opts?: {
  backfill?: boolean;        // Backfill entity_ids (default: true)
  continueOnError?: boolean; // Skip errors (default: false)
  reindex?: boolean;         // Reindex search (default: true)
}): LoadContext {
  if (opts?.backfill !== false) {
    backfillIds(); // Ensure all local entities have entity_id
  }

  const contents = ingestion.ingestList();
  let context: LoadContext = {
    expanding: new Set(),  // Currently loading (cycle detection)
    seen: new Set(),       // Already loaded
    circular: new Set(),   // Caused cycles
    ingestion,
    errors: [],
  };

  for (const path of contents) {
    try {
      context = loadOnePath(context, path);
    } catch (error) {
      if (!opts?.continueOnError) throw error;
      context.errors.push(error);
    }
  }

  if (opts?.reindex !== false) {
    reindexSearch();
  }

  return context;
}
```

### 17.2 Load One Entity

```typescript
function loadOnePath(context: LoadContext, path: SerdesPath): LoadContext {
  const pathKey = serializePathKey(path);

  // Already loading this path AND it's circular? Error!
  if (context.expanding.has(pathKey) && context.circular.has(pathKey)) {
    throw new Error(`Circular dependency on ${pathKey}`);
  }

  // Already loading but not marked circular? Mark and retry
  if (context.expanding.has(pathKey)) {
    context.expanding.delete(pathKey);
    context.circular.add(pathKey);
    return loadOnePath(context, path);
  }

  // Already loaded? Skip
  if (context.seen.has(pathKey)) {
    return context;
  }

  // Ingest the entity
  const ingested = context.ingestion.ingestOne(path);

  if (!ingested) {
    // Check if it exists locally
    if (!loadFindLocal(path)) {
      throw new Error(`Entity not found: ${JSON.stringify(path)}`);
    }
    return context;
  }

  // Handle circular dependency stripping
  if (context.circular.has(pathKey)) {
    ingested["serdes/strip"] = keysToStrip(ingested);
  }

  // If entity should have entity_id but doesn't, generate one
  const modelName = path[path.length - 1].model;
  if (shouldHaveEntityId(modelName) && !ingested.entity_id) {
    ingested.entity_id = generateNanoId();
  }

  // Load dependencies first
  const deps = dependencies(ingested);
  context.expanding.add(pathKey);
  for (const dep of deps) {
    if (!context.seen.has(serializePathKey(dep))) {
      context = loadOnePath(context, dep);
    }
  }

  // Find matching local entity
  const localEntity = loadFindLocal(path);

  // Transform and insert/update
  const adjusted = transformIngested(modelName, ingested);

  if (localEntity) {
    db.update(modelName, localEntity.id, adjusted);
  } else {
    db.insert(modelName, adjusted);
  }

  // Handle nested entities AFTER parent is inserted
  const instance = localEntity
    ? db.selectOne(modelName, { id: localEntity.id })
    : db.selectOne(modelName, { entity_id: ingested.entity_id });

  handleNestedEntities(modelName, ingested, instance);

  context.seen.add(pathKey);
  context.expanding.delete(pathKey);

  return context;
}
```

### 17.3 Find Local Entity

```typescript
function loadFindLocal(path: SerdesPath): DbEntity | null {
  const { model, id } = path[path.length - 1];
  const Model = resolveModel(model);
  return lookupById(Model, id);
}

function lookupById(model: string, idStr: string): DbEntity | null {
  if (isEntityId(idStr)) {
    return db.selectOne(model, { entity_id: idStr });
  }
  // Identity hash - find by computing hash for all entities
  return findByIdentityHash(model, idStr);
}
```

---

## 18. Circular Dependency Handling

Some entities have circular dependencies (e.g., Card references Dashboard which contains that Card).

### 18.1 Strategy

1. **Detection**: When `loadOnePath` encounters a path already in `expanding`, it marks it as `circular`
2. **Stripping**: On the second attempt, certain keys are stripped from the entity before computing dependencies
3. **Two-pass loading**: First pass loads without circular keys; second pass fills them in

### 18.2 Keys to Strip

```typescript
const modelCircularDependencyKeys: Record<string, Set<string>> = {
  "Dashboard": new Set(["dashcards"]),
  "Document": new Set(["document"]),
  "Card": new Set(["dashboard_id", "document_id"]),
};
```

---

## 19. Storage Format

### 19.1 Directory Structure

```
export-root/
├── settings.yaml                          # All settings in one file
├── collections/
│   └── {entity_id}_{slug}/
│       ├── cards/
│       │   └── {entity_id}_{slug}.yaml
│       ├── dashboards/
│       │   └── {entity_id}_{slug}.yaml
│       ├── documents/
│       │   └── {entity_id}_{slug}.yaml
│       ├── timelines/
│       │   └── {entity_id}_{slug}.yaml
│       └── native_query_snippets/
│           └── {entity_id}_{slug}.yaml
├── databases/
│   └── {db_name}/
│       ├── {db_name}.yaml
│       └── schemas/
│           └── {schema_name}/
│               └── tables/
│                   └── {table_name}/
│                       ├── {table_name}.yaml
│                       └── fields/
│                           └── {field_name}.yaml
└── actions/
    └── {entity_id}_{slug}.yaml
```

### 19.2 Filename Convention

- `{entity_id}_{slugified_label}.yaml` - when entity has a label
- `{entity_id}.yaml` - when no label
- Labels are truncated and slugified (unicode-safe)

### 19.3 YAML File Contents

Each YAML file contains one entity with:
- `serdes/meta` key with the path
- All `copy` fields
- All `transform` fields in their exported (portable) form
- Nested entities inlined as arrays

### 19.4 Settings File

All settings are combined into a single `settings.yaml`:
```yaml
site-name: "My Metabase"
enable-embedding: true
# ... all other settings
```

---

## 20. Complete Entity Specs

### 20.1 Card

```typescript
const cardSpec: SerdesSpec = {
  copy: [
    "archived", "archived_directly", "collection_position", "collection_preview",
    "description", "display", "embedding_params", "enable_embedding", "embedding_type",
    "entity_id", "metabase_version", "public_uuid", "query_type", "type", "name",
    "card_schema",
  ],
  skip: [
    "cache_invalidated_at", "view_count", "last_used_at", "initially_published_at",
    "dataset_query_metrics_v2_migration_backup", "cache_ttl",
    "dependency_analysis_version", "legacy_query",
  ],
  transform: {
    created_at:             date(),
    database_id:            fk("Database", "name"),
    table_id:               fk("Table"),
    source_card_id:         fk("Card"),
    collection_id:          fk("Collection"),
    dashboard_id:           fk("Dashboard"),
    document_id:            fk("Document"),
    creator_id:             fk("User"),
    made_public_by_id:      fk("User"),
    dataset_query:          { export: exportMbql, import: importMbql },
    parameters:             { export: exportParameters, import: importParameters },
    parameter_mappings:     { export: exportParameterMappings, import: importParameterMappings },
    visualization_settings: { export: exportVisualizationSettings, import: importVisualizationSettings },
    result_metadata:        { export: exportResultMetadata, import: importResultMetadata },
  },
};
```

### 20.2 Dashboard

```typescript
const dashboardSpec: SerdesSpec = {
  copy: [
    "archived", "archived_directly", "auto_apply_filters", "caveats",
    "collection_position", "description", "embedding_params", "enable_embedding",
    "embedding_type", "entity_id", "name", "points_of_interest", "public_uuid",
    "width",
  ],
  skip: [
    "cache_invalidated_at", "last_used_at", "view_count", "cache_ttl",
    "show_in_getting_started",
  ],
  transform: {
    created_at:             date(),
    initially_published_at: date(),
    collection_id:          fk("Collection"),
    creator_id:             fk("User"),
    made_public_by_id:      fk("User"),
    parameters:             { export: exportParameters, import: importParameters },
    tabs:                   nested("DashboardTab", "dashboard_id"),
    dashcards:              nested("DashboardCard", "dashboard_id"),
  },
  coerce: {
    parameters: ["maybe", ["sequential", "parameter-schema"]],
  },
};
```

### 20.3 Collection

```typescript
const collectionSpec: SerdesSpec = {
  copy: [
    "archive_operation_id", "archived", "archived_directly", "authority_level",
    "description", "entity_id", "is_remote_synced", "is_sample", "name",
    "namespace", "slug", "type",
  ],
  skip: [],
  transform: {
    created_at:        date(),
    // `location` is exported as `parent_id` using composed transform
    location:          as("parent_id", compose(fk("Collection"), {
      export: locationPathToParentId,   // "/1/2/3/" → 3
      import: parentIdToLocationPath,   // 3 → "/1/2/3/"
    })),
    personal_owner_id: fk("User"),
    workspace_id:      fk("Workspace"),
  },
};
```

### 20.4 Database

```typescript
const databaseSpec: SerdesSpec = {
  copy: [
    "auto_run_queries", "cache_field_values_schedule", "caveats", "dbms_version",
    "description", "engine", "is_audit", "is_attached_dwh", "is_full_sync",
    "is_on_demand", "is_sample", "metadata_sync_schedule", "name",
    "points_of_interest", "provider_name", "refingerprint", "settings",
    "timezone", "uploads_enabled", "uploads_schema_name", "uploads_table_prefix",
  ],
  skip: ["cache_ttl", "workspace_permissions_status"],
  transform: {
    created_at:          date(),
    details: {
      exportWithContext: (entity, _key, value) => {
        // Only export if include-database-secrets and not is_attached_dwh
        if (entity.is_attached_dwh) return {};
        return value; // Conditionally included
      },
      import: (value) => value,
    },
    write_data_details: {
      exportWithContext: (entity, _key, value) => {
        if (entity.is_attached_dwh) return {};
        return value;
      },
      import: (value) => value,
    },
    creator_id:          fk("User"),
    router_database_id:  fk("Database"),
    initial_sync_status: {
      export: (value) => value,
      import: () => "complete", // Always set to "complete" on import
    },
  },
};
```

### 20.5 Table

```typescript
const tableSpec: SerdesSpec = {
  copy: [
    "name", "description", "entity_type", "active", "display_name",
    "visibility_type", "schema", "points_of_interest", "caveats",
    "show_in_getting_started", "field_order", "initial_sync_status",
    "is_upload", "database_require_filter", "is_defective_duplicate",
    "unique_table_helper", "is_writable", "data_authority", "data_source",
    "owner_email", "owner_user_id", "is_published",
  ],
  skip: ["estimated_row_count", "view_count"],
  transform: {
    created_at:     date(),
    archived_at:    date(),
    deactivated_at: date(),
    data_layer:     optionalKw(),
    db_id:          fk("Database", "name"),
    collection_id:  fk("Collection"),
    transform_id:   fk("Transform"),
  },
};
```

### 20.6 Field

```typescript
const fieldSpec: SerdesSpec = {
  copy: [
    "active", "base_type", "caveats", "coercion_strategy", "custom_position",
    "database_default", "database_indexed", "database_is_auto_increment",
    "database_is_generated", "database_is_nullable", "database_is_pk",
    "database_partitioned", "database_position", "database_required",
    "database_type", "description", "display_name", "effective_type",
    "has_field_values", "is_defective_duplicate", "json_unfolding", "name",
    "nfc_path", "points_of_interest", "position", "preview_display",
    "semantic_type", "settings", "unique_field_helper", "visibility_type",
  ],
  skip: ["fingerprint", "fingerprint_version", "last_analyzed"],
  transform: {
    created_at:         date(),
    table_id:           fk("Table"),
    fk_target_field_id: fk("Field"),
    parent_id:          fk("Field"),
    dimensions:         nested("Dimension", "field_id"),
  },
};
```

### 20.7 DashboardCard

```typescript
const dashboardCardSpec: SerdesSpec = {
  copy: ["col", "entity_id", "inline_parameters", "row", "size_x", "size_y"],
  skip: [],
  transform: {
    created_at:             date(),
    dashboard_id:           parentRef(),
    card_id:                fk("Card"),
    dashboard_tab_id:       fk("DashboardTab"),
    action_id:              fk("Action"),
    parameter_mappings:     { export: exportParameterMappings, import: importParameterMappings },
    visualization_settings: { export: exportVisualizationSettings, import: importVisualizationSettings },
  },
};
```

### 20.8 DashboardTab

```typescript
const dashboardTabSpec: SerdesSpec = {
  copy: ["entity_id", "name", "position"],
  skip: [],
  transform: {
    created_at:   date(),
    dashboard_id: parentRef(),
  },
};
```

### 20.9 DashboardCardSeries

```typescript
const dashboardCardSeriesSpec: SerdesSpec = {
  copy: ["position"],
  skip: [],
  transform: {
    dashboardcard_id: parentRef(),
    card_id:          fk("Card"),
  },
};
```

### 20.10 Segment

```typescript
const segmentSpec: SerdesSpec = {
  copy: [
    "name", "points_of_interest", "archived", "caveats",
    "description", "entity_id", "show_in_getting_started",
  ],
  skip: ["dependency_analysis_version"],
  transform: {
    created_at: date(),
    table_id:   fk("Table"),
    creator_id: fk("User"),
    definition: { export: exportMbql, import: importMbql },
  },
};
```

### 20.11 Measure

```typescript
const measureSpec: SerdesSpec = {
  copy: ["name", "archived", "description", "entity_id"],
  skip: ["dependency_analysis_version"],
  transform: {
    created_at: date(),
    table_id:   fk("Table"),
    creator_id: fk("User"),
    definition: { export: exportMbql, import: importMeasureDefinition },
  },
};
```

### 20.12 Dimension

```typescript
const dimensionSpec: SerdesSpec = {
  copy: ["name", "type", "entity_id"],
  skip: [],
  transform: {
    created_at:              date(),
    human_readable_field_id: fk("Field"),
    field_id:                parentRef(),
  },
};
```

### 20.13 NativeQuerySnippet

```typescript
const nativeQuerySnippetSpec: SerdesSpec = {
  copy: ["archived", "content", "description", "entity_id", "name", "template_tags"],
  skip: ["dependency_analysis_version"],
  transform: {
    created_at:    date(),
    collection_id: fk("Collection"),
    creator_id:    fk("User"),
  },
};
```

### 20.14 Timeline

```typescript
const timelineSpec: SerdesSpec = {
  copy: ["archived", "default", "description", "entity_id", "icon", "name"],
  skip: [],
  transform: {
    created_at:    date(),
    collection_id: fk("Collection"),
    creator_id:    fk("User"),
    events:        nested("TimelineEvent", "timeline_id"),
  },
};
```

### 20.15 TimelineEvent

```typescript
const timelineEventSpec: SerdesSpec = {
  copy: ["archived", "description", "icon", "name", "time_matters", "timezone"],
  skip: [],
  transform: {
    created_at:  date(),
    creator_id:  fk("User"),
    timeline_id: parentRef(),
    timestamp:   date(),
  },
};
```

### 20.16 Action

```typescript
const actionSpec: SerdesSpec = {
  copy: ["archived", "description", "entity_id", "name", "public_uuid"],
  skip: [],
  transform: {
    created_at:             date(),
    type:                   kw(),
    creator_id:             fk("User"),
    made_public_by_id:      fk("User"),
    model_id:               fk("Card"),
    query:                  nested("QueryAction", "action_id"),
    http:                   nested("HTTPAction", "action_id"),
    implicit:               nested("ImplicitAction", "action_id"),
    parameters:             { export: exportParameters, import: importParameters },
    parameter_mappings:     { export: exportParameterMappings, import: importParameterMappings },
    visualization_settings: { export: exportVisualizationSettings, import: importVisualizationSettings },
  },
};
```

### 20.17 QueryAction (nested in Action)

```typescript
const queryActionSpec: SerdesSpec = {
  copy: [],
  skip: ["legacy_query"],
  transform: {
    action_id:     parentRef(),
    database_id:   fk("Database", "name"),
    dataset_query: { export: exportMbql, import: importMbql },
  },
};
```

### 20.18 HTTPAction (nested in Action)

```typescript
const httpActionSpec: SerdesSpec = {
  copy: ["error_handle", "response_handle", "template"],
  skip: [],
  transform: {
    action_id: parentRef(),
  },
};
```

### 20.19 ImplicitAction (nested in Action)

```typescript
const implicitActionSpec: SerdesSpec = {
  copy: ["kind"],
  skip: [],
  transform: {
    action_id: parentRef(),
  },
};
```

### 20.20 Document

```typescript
const documentSpec: SerdesSpec = {
  copy: [
    "archived", "archived_directly", "content_type", "entity_id",
    "name", "collection_position",
  ],
  skip: [
    "view_count", "last_viewed_at", "public_uuid", "made_public_by_id",
    "dependency_analysis_version",
  ],
  transform: {
    created_at:    date(),
    updated_at:    date(),
    document: {
      exportWithContext: exportDocumentContent,
      importWithContext: importDocumentContent,
    },
    collection_id: fk("Collection"),
    creator_id:    fk("User"),
  },
};
```

### 20.21 Glossary

```typescript
const glossarySpec: SerdesSpec = {
  copy: ["term", "definition"],
  skip: [],
  transform: {
    created_at: date(),
    updated_at: date(),
    creator_id: fk("User"),
  },
};
```

### 20.22 Channel

```typescript
const channelSpec: SerdesSpec = {
  copy: ["name", "description", "type", "details", "active"],
  skip: [],
  transform: {
    created_at: date(),
  },
};
```

### 20.23 Transform

```typescript
const transformSpec: SerdesSpec = {
  copy: ["name", "description", "entity_id", "owner_email"],
  skip: ["dependency_analysis_version", "source_type", "target_db_id"],
  transform: {
    created_at:         date(),
    creator_id:         fk("User"),
    owner_user_id:      fk("User"),
    collection_id:      fk("Collection"),
    source_database_id: fk("Database", "name"),
    source:             {
      export: (value) => ({ ...value, query: exportMbql(value.query) }),
      import: (value) => ({ ...value, query: importMbql(value.query) }),
    },
    target:             { export: exportMbql, import: importMbql },
    tags:               nested("TransformTransformTag", "transform_id"),
  },
};
```

### 20.24 FieldUserSettings

```typescript
const fieldUserSettingsSpec: SerdesSpec = {
  copy: [
    "semantic_type", "description", "display_name", "visibility_type",
    "has_field_values", "effective_type", "coercion_strategy", "caveats",
    "points_of_interest", "nfc_path", "json_unfolding", "settings",
  ],
  skip: [],
  transform: {
    created_at:         date(),
    fk_target_field_id: fk("Field"),
    field_id: {
      isFk: true,
      export: () => SKIP,
      importWithContext: (current, _key, _value) => {
        const fieldRef = fieldPathToFieldRef(current["serdes/meta"]);
        return importFieldFk(fieldRef);
      },
    },
  },
};
```

### 20.25 Model Lists

```typescript
// Models serialized as independent YAML files
const exportedModels = [
  // Data model
  "Database", "Field", "FieldUserSettings", "Measure", "Segment", "Table", "Channel",
  // Content
  "Action", "Card", "Collection", "Dashboard", "Document", "Glossary",
  "NativeQuerySnippet", "Timeline",
  // Other
  "FieldValues", "Metabot", "PythonLibrary", "Setting",
  "Transform", "TransformJob", "TransformTag",
];

// Models inlined into parents (never serialized independently)
const inlinedModels = [
  "DashboardCard", "DashboardTab", "Dimension", "ParameterCard",
  "DashboardCardSeries", "MetabotPrompt", "TimelineEvent",
  "TransformJobTransformTag", "TransformTransformTag",
];

// Models excluded from serialization
const excludedModels = [
  "AnalysisFinding", "AnalysisFindingError", "ApiKey", "AuditLog",
  "User", "Session", "Permissions", "PermissionsGroup",
  // ... many others
];
```

---

## 21. End-to-End Example

### Export: Dashboard with Cards

1. **User initiates export** of Dashboard ID 42

2. **Resolve targets**: `[["Dashboard", 42]]`

3. **Find descendants**: `descendants("Dashboard", 42)` returns:
   - Cards referenced by DashboardCards
   - Collections containing those cards
   - Databases, Tables, Fields referenced by queries

4. **Extract each entity**:
   ```yaml
   # Dashboard export
   serdes/meta:
     - model: Dashboard
       id: "xyz789nanoid_________"
       label: my_dashboard
   name: "My Dashboard"
   collection_id: "abc123nanoid_________"
   creator_id: "admin@example.com"
   parameters:
     - id: "param1"
       type: "category"
       values_source_type: "card"
       values_source_config:
         card_id: "card_entity_id_______"
   dashcards:
     - entity_id: "dc_entity_id_________"
       card_id: "card_entity_id_______"
       row: 0
       col: 0
       size_x: 6
       size_y: 4
       parameter_mappings:
         - parameter_id: "param1"
           card_id: "card_entity_id_______"
           target:
             - field
             - ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]
       visualization_settings:
         click_behavior:
           type: "link"
           linkType: "dashboard"
           targetId: "other_dash_entity_id_"
   tabs:
     - entity_id: "tab_entity_id________"
       name: "Overview"
       position: 0
   ```

5. **Write YAML** to `collections/{collection_id}_{slug}/dashboards/{dash_id}_{slug}.yaml`

6. **Compress** to tar.gz

### Import: Same Archive into Different Instance

1. **Unpack** tar.gz

2. **Backfill IDs** on target instance

3. **Ingest YAML** files, build path index

4. **Load in dependency order**:
   - Load Database "Sample Database" first (no deps)
   - Load Table ["Sample Database", "PUBLIC", "ORDERS"]
   - Load Fields
   - Load Collection "abc123nanoid_________"
   - Load Card "card_entity_id_______" (depends on Database, Table, Collection)
     - Transform `database_id: "Sample Database"` → look up by name → get local ID
     - Transform `table_id: ["Sample Database", "PUBLIC", "ORDERS"]` → look up → get local ID
     - Transform `dataset_query` → resolve all field/table IDs in MBQL
     - Transform `visualization_settings` → resolve field IDs
   - Load Dashboard "xyz789nanoid_________" (depends on Collection, Cards)
     - Transform `collection_id` → resolve entity_id to local ID
     - Transform `creator_id: "admin@example.com"` → find user by email or create inactive
     - **After insert**: process nested `dashcards` and `tabs`
       - For each DashboardCard: resolve `card_id`, `parameter_mappings`, `visualization_settings`
       - Match existing DashboardCards by entity_id, delete stale ones, insert/update

5. **Reindex** search
