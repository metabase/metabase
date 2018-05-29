/* @flow weak */

import {
  createSelector,
  createSelectorCreator,
  defaultMemoize,
} from "reselect";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import Database from "metabase-lib/lib/metadata/Database";
import Table from "metabase-lib/lib/metadata/Table";
import Field from "metabase-lib/lib/metadata/Field";
import Metric from "metabase-lib/lib/metadata/Metric";
import Segment from "metabase-lib/lib/metadata/Segment";

import Databases from "metabase/entities/databases";

import _ from "underscore";
import { shallowEqual } from "recompose";
import { getFieldValues, getRemappings } from "metabase/lib/query/field";

import {
  getOperators,
  getBreakouts,
  getAggregatorsWithFields,
} from "metabase/lib/schema_metadata";
import { getIn } from "icepick";

// fully nomalized, raw "entities"
export const getNormalizedDatabases = state => state.entities.databases;
export const getNormalizedTables = state => state.entities.tables;
export const getNormalizedFields = state => state.entities.fields;
export const getNormalizedMetrics = state => state.entities.metrics;
export const getNormalizedSegments = state => state.entities.segments;

export const getMetadataFetched = state =>
  state.requests.fetched.metadata || {};

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

// fully connected graph of all databases, tables, fields, segments, and metrics
export const getMetadata = createSelector(
  [
    getNormalizedDatabases,
    getNormalizedTables,
    getNormalizedFields,
    getNormalizedSegments,
    getNormalizedMetrics,
  ],
  (databases, tables, fields, segments, metrics): Metadata => {
    const meta = new Metadata();
    meta.databases = copyObjects(meta, databases, Database);
    meta.tables = copyObjects(meta, tables, Table);
    meta.fields = copyObjects(meta, fields, Field);
    meta.segments = copyObjects(meta, segments, Segment);
    meta.metrics = copyObjects(meta, metrics, Metric);
    // meta.loaded    = getLoadedStatuses(requestStates)

    hydrateList(meta.databases, "tables", meta.tables);

    hydrateList(meta.tables, "fields", meta.fields);
    hydrateList(meta.tables, "segments", meta.segments);
    hydrateList(meta.tables, "metrics", meta.metrics);

    hydrate(meta.tables, "db", t => meta.database(t.db_id || t.db));

    hydrate(meta.segments, "table", s => meta.table(s.table_id));
    hydrate(meta.metrics, "table", m => meta.table(m.table_id));
    hydrate(meta.fields, "table", f => meta.table(f.table_id));

    hydrate(meta.fields, "target", f => meta.field(f.fk_target_field_id));
    hydrate(meta.fields, "name_field", f => {
      if (f.name_field != null) {
        return meta.field(f.name_field);
      } else if (f.table && f.isPK()) {
        return _.find(f.table.fields, f => f.isEntityName());
      }
    });

    hydrate(meta.fields, "operators", f => getOperators(f, f.table));
    hydrate(meta.tables, "aggregation_options", t =>
      getAggregatorsWithFields(t),
    );
    hydrate(meta.tables, "breakout_options", t => getBreakouts(t.fields));

    hydrate(meta.fields, "values", f => getFieldValues(f));
    hydrate(meta.fields, "remapping", f => new Map(getRemappings(f)));

    hydrateLookup(meta.databases, "tables", "id");
    hydrateLookup(meta.tables, "fields", "id");
    hydrateLookup(meta.fields, "operators", "name");

    return meta;
  },
);

export const getDatabases = createSelector(
  [getMetadata],
  ({ databases }) => databases,
);

// NOTE: this should be paired with the `fetchDatabaes` action in
// metabase/redux/metadata which uses the same entityQuery
export const getDatabasesList = state =>
  Databases.selectors.getList(state, {
    entityQuery: { include_tables: true, include_cards: true },
  }) || [];

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

// FIELD VALUES FOR DASHBOARD FILTERS / SQL QUESTION PARAMETERS

// Returns a dictionary of field id:s mapped to matching field values
// Currently this assumes that you are passing the props of <ParameterValueWidget> which contain the
// `field_ids` array inside `parameter` prop.
const getParameterFieldValuesByFieldId = (state, props) => {
  // NOTE Atte Keinänen 9/14/17: Reading the state directly instead of using `getFields` selector
  // because `getMetadata` doesn't currently work with fields of public dashboards
  return (
    _.chain(getIn(state, ["entities", "fields"]))
      // SQL template tags provide `field_id` instead of `field_ids`
      .pick(...(props.parameter.field_ids || [props.parameter.field_id]))
      .mapObject(getFieldValues)
      .value()
  );
};

// Custom equality selector for checking if two field value dictionaries contain same fields and field values
// Currently we simply check if fields match and the lengths of field value arrays are equal which makes the comparison fast
// See https://github.com/reactjs/reselect#customize-equalitycheck-for-defaultmemoize
const createFieldValuesEqualSelector = createSelectorCreator(
  defaultMemoize,
  (a, b) => {
    // TODO: Why can't we use plain shallowEqual, i.e. why the field value arrays change very often?
    return shallowEqual(
      _.mapObject(a, values => values.length),
      _.mapObject(b, values => values.length),
    );
  },
);

// HACK Atte Keinänen 7/27/17: Currently the field value analysis code only returns a single value for booleans,
// this will be addressed in analysis sync refactor
const patchBooleanFieldValues_HACK = valueArray => {
  const isBooleanFieldValues =
    valueArray &&
    valueArray.length === 1 &&
    valueArray[0] &&
    typeof valueArray[0][0] === "boolean";

  if (isBooleanFieldValues) {
    return [[true], [false]];
  } else {
    return valueArray;
  }
};

// Merges the field values of fields linked to a parameter and removes duplicates
// We want that we have a distinct selector for each field id combination, and for that reason
// we export a method that creates a new selector; see
// https://github.com/reactjs/reselect#sharing-selectors-with-props-across-multiple-components
// TODO Atte Keinänen 7/20/17: Should we have any thresholds if the count of field values is high or we have many (>2?) fields?
export const makeGetMergedParameterFieldValues = () => {
  return createFieldValuesEqualSelector(
    getParameterFieldValuesByFieldId,
    fieldValues => {
      const fieldIds = Object.keys(fieldValues);

      if (fieldIds.length === 0) {
        // If we have no fields for the parameter, don't return any field values
        return [];
      } else if (fieldIds.length === 1) {
        // We have just a single field so we can return the field values almost as-is,
        // only address the boolean bug for now
        const singleFieldValues = fieldValues[fieldIds[0]];
        return patchBooleanFieldValues_HACK(singleFieldValues);
      } else {
        // We have multiple fields, so let's merge their values to a single array
        const sortedMergedValues = _.chain(Object.values(fieldValues))
          .flatten(true)
          .sortBy(fieldValue => {
            const valueIsRemapped = fieldValue.length === 2;
            return valueIsRemapped ? fieldValue[1] : fieldValue[0];
          })
          .value();

        // run the uniqueness comparision always against a non-remapped value
        return _.uniq(sortedMergedValues, false, fieldValue => fieldValue[0]);
      }
    },
  );
};

// UTILS:

// clone each object in the provided mapping of objects
export function copyObjects(metadata, objects, Klass) {
  let copies = {};
  for (const object of Object.values(objects)) {
    if (object && object.id != null) {
      // $FlowFixMe
      copies[object.id] = new Klass(object);
      // $FlowFixMe
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
    // $FlowFixMe
    object[property] = getPropertyValue(object);
  }
}

// replaces lists of ids with the actual objects
function hydrateList(objects, property, targetObjects) {
  hydrate(objects, property, object =>
    (object[property] || []).map(id => targetObjects[id]),
  );
}

// creates a *_lookup object for a previously hydrated list
function hydrateLookup(objects, property, idProperty = "id") {
  hydrate(objects, property + "_lookup", object => {
    let lookup = {};
    for (const item of object[property] || []) {
      lookup[item[idProperty]] = item;
    }
    return lookup;
  });
}
