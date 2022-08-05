import { createSelector } from "reselect";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import Database from "metabase-lib/lib/metadata/Database";
import Schema from "metabase-lib/lib/metadata/Schema";
import Table from "metabase-lib/lib/metadata/Table";
import Field from "metabase-lib/lib/metadata/Field";
import Metric from "metabase-lib/lib/metadata/Metric";
import Segment from "metabase-lib/lib/metadata/Segment";
import { isVirtualCardId } from "metabase/lib/saved-questions/saved-questions";

import _ from "underscore";
import { getFieldValues, getRemappings } from "metabase/lib/query/field";

// fully nomalized, raw "entities"
export const getNormalizedDatabases = state => state.entities.databases;
export const getNormalizedSchemas = state => state.entities.schemas;
const getNormalizedTablesUnfiltered = state => state.entities.tables;
const getIncludeHiddenTables = (_state, props) => props?.includeHiddenTables;
export const getNormalizedTables = createSelector(
  [getNormalizedTablesUnfiltered, getIncludeHiddenTables],
  // remove hidden tables from the metadata graph
  (tables, includeHiddenTables) =>
    includeHiddenTables
      ? tables
      : filterValues(tables, table => table.visibility_type == null),
);

const getNormalizedFieldsUnfiltered = state => state.entities.fields;
export const getNormalizedFields = createSelector(
  [getNormalizedFieldsUnfiltered, getNormalizedTablesUnfiltered],
  (fields, tables) =>
    filterValues(fields, field => {
      // remove fields that are sensitive or belong to hidden tables
      const table = tables[field.table_id];
      return (
        (!table || table.visibility_type == null) &&
        field.visibility_type !== "sensitive"
      );
    }),
);
export const getNormalizedMetrics = state => state.entities.metrics;
export const getNormalizedSegments = state => state.entities.segments;
export const getNormalizedCards = state => state.entities.questions;

// TODO: these should be denomalized but non-cylical, and only to the same "depth" previous "tableMetadata" was, e.x.
//
// TABLE:
//
// {
//     db: {
//         tables: undefined,
//     }
//     fields: [{
//         table: undefined,
//         target: {
//             table: {
//                 fields: undefined
//             }
//         }
//     }]
// }
//
export const getShallowDatabases = getNormalizedDatabases;
export const getShallowTables = getNormalizedTables;
export const getShallowFields = getNormalizedFields;
export const getShallowMetrics = getNormalizedMetrics;
export const getShallowSegments = getNormalizedSegments;

export const instantiateDatabase = obj => new Database(obj);
export const instantiateSchema = obj => new Schema(obj);
export const instantiateTable = obj => new Table(obj);
// We need a way to distinguish field objects that come from the server
// vs. those that are created client-side to handle lossy transformations between
// Field instances and FieldDimension instances.
// There are scenarios where we are failing to convert FieldDimensions back into Fields,
// and as a safeguard we instantiate a new Field that is missing most of its properties.
export const instantiateField = obj =>
  new Field({ ...obj, _comesFromEndpoint: true });
export const instantiateSegment = obj => new Segment(obj);
export const instantiateMetric = obj => new Metric(obj);

// fully connected graph of all databases, tables, fields, segments, and metrics
// TODO: do this lazily using ES6 Proxies
export const getMetadata = createSelector(
  [
    getNormalizedDatabases,
    getNormalizedSchemas,
    getNormalizedTables,
    getNormalizedFields,
    getNormalizedSegments,
    getNormalizedMetrics,
    getNormalizedCards,
  ],
  (databases, schemas, tables, fields, segments, metrics, cards) => {
    const meta = new Metadata();
    meta.databases = copyObjects(meta, databases, instantiateDatabase);
    meta.schemas = copyObjects(meta, schemas, instantiateSchema);
    meta.tables = copyObjects(meta, tables, instantiateTable);
    meta.fields = copyObjects(meta, fields, instantiateField);
    meta.segments = copyObjects(meta, segments, instantiateSegment);
    meta.metrics = copyObjects(meta, metrics, instantiateMetric);
    meta.cards = copyObjects(meta, cards, _.identity);

    // database
    hydrate(meta.databases, "tables", database => {
      if (database.tables?.length > 0) {
        return database.tables
          .map(tableId => meta.table(tableId))
          .filter(table => table != null);
      }

      return Object.values(meta.tables).filter(
        table =>
          !isVirtualCardId(table.id) &&
          table.schema &&
          table.db_id === database.id,
      );
    });
    // schema
    hydrate(meta.schemas, "database", s => meta.database(s.database));
    // table
    hydrateList(meta.tables, "fields", meta.fields);
    hydrateList(meta.tables, "segments", meta.segments);
    hydrateList(meta.tables, "metrics", meta.metrics);
    hydrate(meta.tables, "db", t => meta.database(t.db_id || t.db));
    hydrate(meta.tables, "schema", t => meta.schema(t.schema));

    hydrate(meta.databases, "schemas", database => {
      if (database.schemas) {
        return database.schemas.map(s => meta.schema(s));
      }
      return Object.values(meta.schemas).filter(
        s => s.database && s.database.id === database.id,
      );
    });

    hydrate(meta.schemas, "tables", schema =>
      schema.tables
        ? // use the schema tables if they exist
          schema.tables.map(t => meta.table(t))
        : schema.database && schema.database.tables.length > 0
        ? // if the schema has a database with tables, use those
          schema.database.tables.filter(t => t.schema_name === schema.name)
        : // otherwise use any loaded tables that match the schema id
          Object.values(meta.tables).filter(
            t => t.schema && t.schema.id === schema.id,
          ),
    );

    // segments
    hydrate(meta.segments, "table", s => meta.table(s.table_id));
    // metrics
    hydrate(meta.metrics, "table", m => meta.table(m.table_id));
    // fields
    hydrate(meta.fields, "table", f => meta.table(f.table_id));
    hydrate(meta.fields, "target", f => meta.field(f.fk_target_field_id));
    hydrate(meta.fields, "name_field", f => {
      if (f.name_field != null) {
        return meta.field(f.name_field);
      } else if (f.table && f.isPK()) {
        return _.find(f.table.fields, f => f.isEntityName());
      }
    });

    hydrate(meta.fields, "values", f => getFieldValues(f));
    hydrate(meta.fields, "remapping", f => new Map(getRemappings(f)));
    return meta;
  },
);

export const getMetadataWithHiddenTables = (state, props) => {
  return getMetadata(state, { ...props, includeHiddenTables: true });
};

export const getDatabases = createSelector(
  [getMetadata],
  ({ databases }) => databases,
);

export const getTables = createSelector([getMetadata], ({ tables }) => tables);

export const getFields = createSelector([getMetadata], ({ fields }) => fields);
export const getMetrics = createSelector(
  [getMetadata],
  ({ metrics }) => metrics,
);

export const getSegments = createSelector(
  [getMetadata],
  ({ segments }) => segments,
);

// UTILS:

// clone each object in the provided mapping of objects
export function copyObjects(metadata, objects, instantiate) {
  const copies = {};
  for (const object of Object.values(objects)) {
    if (object && object.id != null) {
      copies[object.id] = instantiate(object);
      copies[object.id].metadata = metadata;
    } else {
      console.warn("Missing id:", object);
    }
  }
  return copies;
}

// calls a function to derive the value of a property for every object
function hydrate(objects, property, getPropertyValue) {
  for (const object of Object.values(objects)) {
    object[property] = getPropertyValue(object);
  }
}

// replaces lists of ids with the actual objects
function hydrateList(objects, property, targetObjects) {
  hydrate(objects, property, object =>
    (object[property] || [])
      .map(id => targetObjects[id])
      .filter(o => o != null),
  );
}

function filterValues(obj, pred) {
  const filtered = {};
  for (const [k, v] of Object.entries(obj)) {
    if (pred(v)) {
      filtered[k] = v;
    }
  }
  return filtered;
}
