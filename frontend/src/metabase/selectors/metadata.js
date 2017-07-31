/* @flow weak */

import { createSelector } from "reselect";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import Database from "metabase-lib/lib/metadata/Database";
import Table from "metabase-lib/lib/metadata/Table";
import Field from "metabase-lib/lib/metadata/Field";
import Metric from "metabase-lib/lib/metadata/Metric";
import Segment from "metabase-lib/lib/metadata/Segment";

import { getIn } from "icepick";
import { getFieldValues } from "metabase/lib/query/field";

import {
    getOperators,
    getBreakouts,
    getAggregatorsWithFields
} from "metabase/lib/schema_metadata";

export const getNormalizedMetadata = state => state.metadata;

// fully denomalized, raw "entities"
export const getNormalizedDatabases = state => state.metadata.databases;
export const getNormalizedTables = state => state.metadata.tables;
export const getNormalizedFields = state => state.metadata.fields;
export const getNormalizedMetrics = state => state.metadata.metrics;
export const getNormalizedSegments = state => state.metadata.segments;


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
        getNormalizedMetrics
    ],
    (databases, tables, fields, segments, metrics): Metadata => {
        const meta = new Metadata();
        meta.databases = copyObjects(meta, databases, Database)
        meta.tables    = copyObjects(meta, tables, Table)
        meta.fields    = copyObjects(meta, fields, Field)
        meta.segments  = copyObjects(meta, segments, Segment)
        meta.metrics   = copyObjects(meta, metrics, Metric)

        hydrateList(meta.databases, "tables", meta.tables);

        hydrateList(meta.tables, "fields", meta.fields);
        hydrateList(meta.tables, "segments", meta.segments);
        hydrateList(meta.tables, "metrics", meta.metrics);

        hydrate(meta.tables, "db", t => meta.databases[t.db_id || t.db]);

        hydrate(meta.segments, "table", s => meta.tables[s.table_id]);
        hydrate(meta.metrics, "table", m => meta.tables[m.table_id]);
        hydrate(meta.fields, "table", f => meta.tables[f.table_id]);

        hydrate(meta.fields, "target", f => meta.fields[f.fk_target_field_id]);

        hydrate(meta.fields, "operators", f => getOperators(f, f.table));
        hydrate(meta.tables, "aggregation_options", t =>
            getAggregatorsWithFields(t));
        hydrate(meta.tables, "breakout_options", t => getBreakouts(t.fields));

        hydrate(meta.fields, "remapping", f => new Map(getFieldValues(f)));

        hydrateLookup(meta.databases, "tables", "id");
        hydrateLookup(meta.tables, "fields", "id");
        hydrateLookup(meta.fields, "operators", "name");

        return meta;
    }
);

export const getDatabases = createSelector(
    [getMetadata],
    ({ databases }) => databases
);

export const getDatabasesList = createSelector(
    [getDatabases, state => state.metadata.databasesList],
    (databases, ids) => ids.map(id => databases[id])
);

export const getTables = createSelector([getMetadata], ({ tables }) => tables);

export const getFields = createSelector([getMetadata], ({ fields }) => fields);
export const getMetrics = createSelector(
    [getMetadata],
    ({ metrics }) => metrics
);

export const getSegments = createSelector(
    [getMetadata],
    ({ segments }) => segments
);

// MISC

export const getParameterFieldValues = (state, props) => {
    const fieldValues = getFieldValues(getIn(state, ["metadata", "fields", props.parameter.field_id]));

    // HACK Atte Keinänen 7/27/17: Currently the field value analysis code only returns a single value for booleans,
    // this will be addressed in analysis sync refactor
    const isBooleanFieldValues =
        fieldValues && fieldValues.length === 1 && fieldValues[0] && typeof(fieldValues[0][0]) === "boolean"
    if (isBooleanFieldValues) {
        return [[true], [false]];
    } else {
        return fieldValues;
    }
}

// UTILS:

// clone each object in the provided mapping of objects
export function copyObjects(metadata, objects, Klass) {
    let copies = {};
    for (const object of Object.values(objects)) {
        // $FlowFixMe
        copies[object.id] = new Klass(object);
        // $FlowFixMe
        copies[object.id].metadata = metadata;
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
    hydrate(
        objects,
        property,
        object =>
            (object[property] || []).map(id => targetObjects[id])
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
