import { createThunkAction, fetchData, updateData } from "metabase/lib/redux";

import { getIn } from "icepick";
import _ from "underscore";

import { getMetadata } from "metabase/selectors/metadata";

import { MetabaseApi, MetricApi, RevisionsApi } from "metabase/services";
// import { entities } from "metabase/redux/entities";
import {
  databases,
  tables,
  fields,
  segments,
  metrics,
} from "metabase/entities";

export const FETCH_METRICS = metrics.actions.fetchList.toString();
export const fetchMetrics = (reload = false) => {
  console.warn("DEPRECATED: metabase/redux/metadata fetchMetrics");
  return metrics.actions.fetchList(null, reload);
};
// export const FETCH_METRICS = "metabase/metadata/FETCH_METRICS";
// export const fetchMetrics = createThunkAction(
//   FETCH_METRICS,
//   (reload = false) => {
//     return async (dispatch, getState) => {
//       const requestStatePath = ["entities", "metrics"];
//       const existingStatePath = requestStatePath;
//       const getData = async () => {
//         const metrics = await MetricApi.list();
//         return normalize(metrics, [MetricSchema]);
//       };
//
//       return await fetchData({
//         dispatch,
//         getState,
//         requestStatePath,
//         existingStatePath,
//         getData,
//         reload,
//       });
//     };
//   },
// );

export const updateMetric = metric => {
  console.warn("DEPRECATED: metabase/redux/metadata updateMetric");
  return metrics.actions.update(metric);
};
// const UPDATE_METRIC = "metabase/metadata/UPDATE_METRIC";
// export const updateMetric = createThunkAction(UPDATE_METRIC, function(metric) {
//   return async (dispatch, getState) => {
//     const requestStatePath = ["entities", "metrics", metric.id];
//     const existingStatePath = ["entities", "metrics"];
//     const dependentRequestStatePaths = [
//       ["entities", "revisions", "metric", metric.id],
//     ];
//     const putData = async () => {
//       const updatedMetric = await MetricApi.update(metric);
//       return normalize(updatedMetric, MetricSchema);
//     };
//
//     return await updateData({
//       dispatch,
//       getState,
//       requestStatePath,
//       existingStatePath,
//       dependentRequestStatePaths,
//       putData,
//     });
//   };
// });

const UPDATE_METRIC_IMPORTANT_FIELDS =
  "metabase/guide/UPDATE_METRIC_IMPORTANT_FIELDS";
export const updateMetricImportantFields = createThunkAction(
  UPDATE_METRIC_IMPORTANT_FIELDS,
  function(metricId, importantFieldIds) {
    return async (dispatch, getState) => {
      const requestStatePath = [
        "reference",
        "guide",
        "metric_important_fields",
        metricId,
      ];
      const existingStatePath = requestStatePath;
      const dependentRequestStatePaths = [["reference", "guide"]];
      const putData = async () => {
        await MetricApi.update_important_fields({
          metricId,
          important_field_ids: importantFieldIds,
        });
      };

      return await updateData({
        dispatch,
        getState,
        requestStatePath,
        existingStatePath,
        dependentRequestStatePaths,
        putData,
      });
    };
  },
);

export const FETCH_SEGMENTS = segments.actions.fetchList.toString();
export const fetchSegments = (reload = false) => {
  console.warn("DEPRECATED: metabase/redux/metadata fetchSegments");
  return segments.actions.fetchList(null, reload);
};
// export const FETCH_SEGMENTS = "metabase/metadata/FETCH_SEGMENTS";
// export const fetchSegments = createThunkAction(
//   FETCH_SEGMENTS,
//   (reload = false) => {
//     return async (dispatch, getState) => {
//       const requestStatePath = ["entities", "segments"];
//       const existingStatePath = requestStatePath;
//       const getData = async () => {
//         const segments = await SegmentApi.list();
//         return normalize(segments, [SegmentSchema]);
//       };
//
//       return await fetchData({
//         dispatch,
//         getState,
//         requestStatePath,
//         existingStatePath,
//         getData,
//         reload,
//       });
//     };
//   },
// );

export const updateSegment = segment => {
  console.warn("DEPRECATED: metabase/redux/metadata updateSegment");
  return segments.actions.update(segment);
};
// const UPDATE_SEGMENT = "metabase/metadata/UPDATE_SEGMENT";
// export const updateSegment = createThunkAction(UPDATE_SEGMENT, function(
//   segment,
// ) {
//   return async (dispatch, getState) => {
//     const requestStatePath = ["entities", "segments", segment.id];
//     const existingStatePath = ["entities", "segments"];
//     const dependentRequestStatePaths = [
//       ["entities", "revisions", "segment", segment.id],
//     ];
//     const putData = async () => {
//       const updatedSegment = await SegmentApi.update(segment);
//       return normalize(updatedSegment, SegmentSchema);
//     };
//
//     return await updateData({
//       dispatch,
//       getState,
//       requestStatePath,
//       existingStatePath,
//       dependentRequestStatePaths,
//       putData,
//     });
//   };
// });

export const FETCH_DATABASES = databases.actions.fetchList.toString();
export const fetchDatabases = (reload = false) => {
  console.warn("DEPRECATED: metabase/redux/metadata fetchDatabases");
  return databases.actions.fetchList(
    {
      include_tables: true,
      include_cards: true,
    },
    reload,
  );
};
// export const FETCH_DATABASES = "metabase/metadata/FETCH_DATABASES";
// export const fetchDatabases = createThunkAction(
//   FETCH_DATABASES,
//   (reload = false) => {
//     return async (dispatch, getState) => {
//       const requestStatePath = ["entities", "databases"];
//       const existingStatePath = requestStatePath;
//       const getData = async () => {
//         const databases = await MetabaseApi.db_list_with_tables();
//         return normalize(databases, [DatabaseSchema]);
//       };
//
//       return await fetchData({
//         dispatch,
//         getState,
//         requestStatePath,
//         existingStatePath,
//         getData,
//         reload,
//       });
//     };
//   },
// );

export const FETCH_REAL_DATABASES = databases.actions.fetchList.toString();
export const fetchRealDatabases = (reload = false) => {
  console.warn("DEPRECATED: metabase/redux/metadata fetchRealDatabases");
  return databases.actions.fetchList(
    {
      include_tables: true,
      include_cards: false,
    },
    reload,
  );
};
// export const FETCH_REAL_DATABASES = "metabase/metadata/FETCH_REAL_DATABASES";
// export const fetchRealDatabases = createThunkAction(
//   FETCH_REAL_DATABASES,
//   (reload = false) => {
//     return async (dispatch, getState) => {
//       const requestStatePath = ["entities", "databases"];
//       const existingStatePath = requestStatePath;
//       const getData = async () => {
//         const databases = await MetabaseApi.db_real_list_with_tables();
//         return normalize(databases, [DatabaseSchema]);
//       };
//
//       return await fetchData({
//         dispatch,
//         getState,
//         requestStatePath,
//         existingStatePath,
//         getData,
//         reload,
//       });
//     };
//   },
// );

export const FETCH_DATABASE_METADATA = databases.actions.fetchDatabaseMetadata.toString();
export const fetchDatabaseMetadata = (dbId, reload = false) => {
  console.warn("DEPRECATED: metabase/redux/metadata fetchDatabaseMetadata");
  return databases.actions.fetchDatabaseMetadata({ id: dbId }, reload);
};
// export const FETCH_DATABASE_METADATA =
//   "metabase/entities/database/FETCH_DATABASE_METADATA";
// export const fetchDatabaseMetadata = createThunkAction(
//   FETCH_DATABASE_METADATA,
//   function(dbId, reload = false) {
//     return async function(dispatch, getState) {
//       const requestStatePath = ["entities", "databases", dbId];
//       const existingStatePath = ["entities"];
//       const getData = async () => {
//         const databaseMetadata = await MetabaseApi.db_metadata({ dbId });
//         return normalize(databaseMetadata, DatabaseSchema);
//       };
//
//       return await fetchData({
//         dispatch,
//         getState,
//         requestStatePath,
//         existingStatePath,
//         getData,
//         reload,
//       });
//     };
//   },
// );

export const updateDatabase = database => {
  console.warn("DEPRECATED: metabase/redux/metadata updateDatabase");
  const slimDatabase = _.omit(database, "tables", "tables_lookup");
  return database.actions.update(slimDatabase);
};
// const UPDATE_DATABASE = "metabase/metadata/UPDATE_DATABASE";
// export const updateDatabase = createThunkAction(UPDATE_DATABASE, function(
//   database,
// ) {
//   return async (dispatch, getState) => {
//     const requestStatePath = ["entities", "databases", database.id];
//     const existingStatePath = ["entities", "databases"];
//     const putData = async () => {
//       // make sure we don't send all the computed metadata
//       // there may be more that I'm missing?
//       const slimDatabase = _.omit(database, "tables", "tables_lookup");
//       const updatedDatabase = await MetabaseApi.db_update(slimDatabase);
//       return normalize(updatedDatabase, DatabaseSchema);
//     };
//
//     return await updateData({
//       dispatch,
//       getState,
//       requestStatePath,
//       existingStatePath,
//       putData,
//     });
//   };
// });

export const updateTable = table => {
  console.warn("DEPRECATED: metabase/redux/metadata updateTable");
  const slimTable = _.omit(
    table,
    "fields",
    "fields_lookup",
    "aggregation_options",
    "breakout_options",
    "metrics",
    "segments",
  );
  return tables.actions.update(slimTable);
};
// const UPDATE_TABLE = "metabase/metadata/UPDATE_TABLE";
// export const updateTable = createThunkAction(UPDATE_TABLE, function(table) {
//   return async (dispatch, getState) => {
//     const requestStatePath = ["entities", "tables", table.id];
//     const existingStatePath = ["entities", "tables"];
//     const putData = async () => {
//       // make sure we don't send all the computed metadata
//       const slimTable = _.omit(
//         table,
//         "fields",
//         "fields_lookup",
//         "aggregation_options",
//         "breakout_options",
//         "metrics",
//         "segments",
//       );
//
//       const updatedTable = await MetabaseApi.table_update(slimTable);
//       return normalize(updatedTable, TableSchema);
//     };
//
//     return await updateData({
//       dispatch,
//       getState,
//       requestStatePath,
//       existingStatePath,
//       putData,
//     });
//   };
// });

export const fetchTables = (reload = false) => {
  console.warn("DEPRECATED: metabase/redux/metadata fetchTables");
  return tables.actions.fetchList(null, reload);
};
// const FETCH_TABLES = "metabase/metadata/FETCH_TABLES";
// export const fetchTables = createThunkAction(FETCH_TABLES, (reload = false) => {
//   return async (dispatch, getState) => {
//     const requestStatePath = ["entities", "tables"];
//     const existingStatePath = requestStatePath;
//     const getData = async () => {
//       const tables = await MetabaseApi.table_list();
//       return normalize(tables, [TableSchema]);
//     };
//
//     return await fetchData({
//       dispatch,
//       getState,
//       requestStatePath,
//       existingStatePath,
//       getData,
//       reload,
//     });
//   };
// });

export { FETCH_TABLE_METADATA } from "metabase/entities/tables";
export const fetchTableMetadata = (tableId, reload = false) => {
  console.warn("DEPRECATED: metabase/redux/metadata fetchTableMetadata");
  return tables.actions.fetchTableMetadata({ id: tableId }, reload);
};
// export const FETCH_TABLE_METADATA = "metabase/entities/FETCH_TABLE_METADATA";
// export const fetchTableMetadata = createThunkAction(
//   FETCH_TABLE_METADATA,
//   function(tableId, reload = false) {
//     return async function(dispatch, getState) {
//       const requestStatePath = ["entities", "tables", tableId];
//       const existingStatePath = ["entities"];
//       const getData = async () => {
//         const tableMetadata = await MetabaseApi.table_query_metadata({
//           tableId,
//         });
//         const fkTableIds = _.chain(tableMetadata.fields)
//           .filter(field => field.target)
//           .map(field => field.target.table_id)
//           .uniq()
//           .value();
//         const fkTables = await Promise.all(
//           fkTableIds.map(tableId =>
//             MetabaseApi.table_query_metadata({ tableId }),
//           ),
//         );
//         return normalize([tableMetadata].concat(fkTables), [TableSchema]);
//       };
//
//       return await fetchData({
//         dispatch,
//         getState,
//         requestStatePath,
//         existingStatePath,
//         getData,
//         reload,
//       });
//     };
//   },
// );

export const fetchField = (id, reload = false) => {
  console.warn("DEPRECATED: metabase/redux/metadata fetchField");
  return fields.actions.fetch({ id }, reload);
};
// export const FETCH_FIELD = "metabase/metadata/FETCH_FIELD";
// export const fetchField = createThunkAction(FETCH_FIELD, function(
//   fieldId,
//   reload,
// ) {
//   return async function(dispatch, getState) {
//     const requestStatePath = ["entities", "fields", fieldId];
//     const existingStatePath = requestStatePath;
//     const getData = async () =>
//       normalize(await MetabaseApi.field_get({ fieldId }), FieldSchema);
//
//     return await fetchData({
//       dispatch,
//       getState,
//       requestStatePath,
//       existingStatePath,
//       getData,
//       reload: true,
//     });
//   };
// });

export const FETCH_FIELD_VALUES = fields.actions.fetchFieldValues.toString();
export const fetchFieldValues = (fieldId, reload) => {
  console.warn("DEPRECATED: metabase/redux/metadata fetchFieldValues");
  return fields.actions.fetchFieldValues({ id: fieldId }, reload);
};
// export const FETCH_FIELD_VALUES = "metabase/metadata/FETCH_FIELD_VALUES";
// export const fetchFieldValues = createThunkAction(FETCH_FIELD_VALUES, function(
//   fieldId,
//   reload,
// ) {
//   return async function(dispatch, getState) {
//     const requestStatePath = ["entities", "fields", fieldId, "values"];
//     const existingStatePath = requestStatePath;
//     const getData = () => MetabaseApi.field_values({ fieldId });
//
//     return await fetchData({
//       dispatch,
//       getState,
//       requestStatePath,
//       existingStatePath,
//       getData,
//       reload,
//     });
//   };
// });

export const UPDATE_FIELD_VALUES = fields.actions.updateFieldValues.toString();
export const updateFieldValues = (fieldId, fieldValuePairs) => {
  console.warn("DEPRECATED: metabase/redux/metadata updateFieldValues");
  return fields.actions.updateFieldValues({ id: fieldId }, fieldValuePairs);
};
// // Docstring from m.api.field:
// // Update the human-readable values for a `Field` whose special type is
// // `category`/`city`/`state`/`country` or whose base type is `type/Boolean`."
// export const UPDATE_FIELD_VALUES = "metabase/metadata/UPDATE_FIELD_VALUES";
// export const updateFieldValues = createThunkAction(
//   UPDATE_FIELD_VALUES,
//   function(fieldId, fieldValuePairs) {
//     return async function(dispatch, getState) {
//       const requestStatePath = ["entities", "fields", fieldId, "dimension"];
//       const existingStatePath = ["entities", "fields", fieldId];
//
//       const putData = async () => {
//         return await MetabaseApi.field_values_update({
//           fieldId,
//           values: fieldValuePairs,
//         });
//       };
//
//       return await updateData({
//         dispatch,
//         getState,
//         requestStatePath,
//         existingStatePath,
//         putData,
//       });
//     };
//   },
// );

export { ADD_PARAM_VALUES } from "metabase/entities/fields";
export const addParamValues = paramValues => {
  console.warn("DEPRECATED: metabase/redux/metadata addParamValues");
  return fields.actions.addParamValues(paramValues);
};

export { ADD_FIELDS } from "metabase/entities/fields";
export const addFields = fieldMaps => {
  console.warn("DEPRECATED: metabase/redux/metadata addFields");
  return fields.actions.addFields(fieldMaps);
};
// export const ADD_FIELDS = "metabase/entities/ADD_FIELDS";
// export const addFields = createAction(ADD_FIELDS, fields => {
//   return normalize(fields, [FieldSchema]);
// });

export const UPDATE_FIELD = fields.actions.update.toString();
export const updateField = field => {
  console.warn("DEPRECATED: metabase/redux/metadata updateField");
  const slimField = _.omit(field, "operators_lookup");
  return fields.actions.update(slimField);
};
// export const updateField = createThunkAction(UPDATE_FIELD, function(field) {
//   return async function(dispatch, getState) {
//     const requestStatePath = ["entities", "fields", field.id];
//     const existingStatePath = ["entities", "fields"];
//     const putData = async () => {
//       // make sure we don't send all the computed metadata
//       // there may be more that I'm missing?
//       const slimField = _.omit(field, "operators_lookup");
//
//       const updatedField = await MetabaseApi.field_update(slimField);
//       return normalize(updatedField, FieldSchema);
//     };
//
//     return await updateData({
//       dispatch,
//       getState,
//       requestStatePath,
//       existingStatePath,
//       putData,
//     });
//   };
// });

export const DELETE_FIELD_DIMENSION = fields.actions.deleteFieldDimension.toString();
export const deleteFieldDimension = fieldId => {
  console.warn("DEPRECATED: metabase/redux/metadata deleteFieldDimension");
  return fields.actions.deleteFieldDimension({ id: fieldId });
};
// export const DELETE_FIELD_DIMENSION =
//   "metabase/metadata/DELETE_FIELD_DIMENSION";
// export const deleteFieldDimension = createThunkAction(
//   DELETE_FIELD_DIMENSION,
//   function(fieldId) {
//     return async function(dispatch, getState) {
//       const requestStatePath = ["entities", "fields", fieldId, "dimension"];
//       const existingStatePath = ["entities", "fields", fieldId];
//
//       const putData = async () => {
//         return await MetabaseApi.field_dimension_delete({ fieldId });
//       };
//
//       return await updateData({
//         dispatch,
//         getState,
//         requestStatePath,
//         existingStatePath,
//         putData,
//       });
//     };
//   },
// );

export const UPDATE_FIELD_DIMENSION = fields.actions.updateFieldDimension.toString();
export const updateFieldDimension = (fieldId, dimension) => {
  console.warn("DEPRECATED: metabase/redux/metadata updateFieldDimension");
  return fields.actions.updateFieldDimension({ id: fieldId }, dimension);
};
// export const UPDATE_FIELD_DIMENSION =
//   "metabase/metadata/UPDATE_FIELD_DIMENSION";
// export const updateFieldDimension = createThunkAction(
//   UPDATE_FIELD_DIMENSION,
//   function(fieldId, dimension) {
//     return async function(dispatch, getState) {
//       const requestStatePath = ["entities", "fields", fieldId, "dimension"];
//       const existingStatePath = ["entities", "fields", fieldId];
//
//       const putData = async () => {
//         return await MetabaseApi.field_dimension_update({
//           fieldId,
//           ...dimension,
//         });
//       };
//
//       return await updateData({
//         dispatch,
//         getState,
//         requestStatePath,
//         existingStatePath,
//         putData,
//       });
//     };
//   },
// );
//
export const FETCH_REVISIONS = "metabase/metadata/FETCH_REVISIONS";
export const fetchRevisions = createThunkAction(
  FETCH_REVISIONS,
  (type, id, reload = false) => {
    return async (dispatch, getState) => {
      const requestStatePath = ["revisions", type, id];
      const existingStatePath = ["revisions"];
      const getData = async () => {
        return {
          type,
          id,
          revisions: await RevisionsApi.get({ id, entity: type }),
        };
      };

      return await fetchData({
        dispatch,
        getState,
        requestStatePath,
        existingStatePath,
        getData,
        reload,
      });
    };
  },
);

// for fetches with data dependencies in /reference
export const FETCH_METRIC_TABLE = "metabase/metadata/FETCH_METRIC_TABLE";
export const fetchMetricTable = createThunkAction(
  FETCH_METRIC_TABLE,
  (metricId, reload = false) => {
    return async (dispatch, getState) => {
      await dispatch(fetchMetrics()); // FIXME: fetchMetric?
      const metric = getIn(getState(), ["entities", "metrics", metricId]);
      const tableId = metric.table_id;
      await dispatch(fetchTableMetadata(tableId));
    };
  },
);

export const FETCH_METRIC_REVISIONS =
  "metabase/metadata/FETCH_METRIC_REVISIONS";
export const fetchMetricRevisions = createThunkAction(
  FETCH_METRIC_REVISIONS,
  (metricId, reload = false) => {
    return async (dispatch, getState) => {
      await Promise.all([
        dispatch(fetchRevisions("metric", metricId)),
        dispatch(fetchMetrics()),
      ]);
      const metric = getIn(getState(), ["entities", "metrics", metricId]);
      const tableId = metric.table_id;
      await dispatch(fetchTableMetadata(tableId));
    };
  },
);

export const FETCH_SEGMENT_FIELDS = "metabase/metadata/FETCH_SEGMENT_FIELDS";
export const fetchSegmentFields = createThunkAction(
  FETCH_SEGMENT_FIELDS,
  (segmentId, reload = false) => {
    return async (dispatch, getState) => {
      await dispatch(fetchSegments()); // FIXME: fetchSegment?
      const segment = getIn(getState(), ["entities", "segments", segmentId]);
      const tableId = segment.table_id;
      await dispatch(fetchTableMetadata(tableId));
      const table = getIn(getState(), ["entities", "tables", tableId]);
      const databaseId = table.db_id;
      await dispatch(fetchDatabaseMetadata(databaseId));
    };
  },
);

export const FETCH_SEGMENT_TABLE = "metabase/metadata/FETCH_SEGMENT_TABLE";
export const fetchSegmentTable = createThunkAction(
  FETCH_SEGMENT_TABLE,
  (segmentId, reload = false) => {
    return async (dispatch, getState) => {
      await dispatch(fetchSegments()); // FIXME: fetchSegment?
      const segment = getIn(getState(), ["entities", "segments", segmentId]);
      const tableId = segment.table_id;
      await dispatch(fetchTableMetadata(tableId));
    };
  },
);

export const FETCH_SEGMENT_REVISIONS =
  "metabase/metadata/FETCH_SEGMENT_REVISIONS";
export const fetchSegmentRevisions = createThunkAction(
  FETCH_SEGMENT_REVISIONS,
  (segmentId, reload = false) => {
    return async (dispatch, getState) => {
      await Promise.all([
        dispatch(fetchRevisions("segment", segmentId)),
        dispatch(fetchSegments()),
      ]);
      const segment = getIn(getState(), ["entities", "segments", segmentId]);
      const tableId = segment.table_id;
      await dispatch(fetchTableMetadata(tableId));
    };
  },
);

const FETCH_DATABASES_WITH_METADATA =
  "metabase/metadata/FETCH_DATABASES_WITH_METADATA";
export const fetchDatabasesWithMetadata = createThunkAction(
  FETCH_DATABASES_WITH_METADATA,
  (reload = false) => {
    return async (dispatch, getState) => {
      await dispatch(fetchDatabases());
      const databases = getIn(getState(), ["entities", "databases"]);
      await Promise.all(
        Object.values(databases).map(database =>
          dispatch(fetchDatabaseMetadata(database.id)),
        ),
      );
    };
  },
);

export const addRemappings = (fieldId, remappings) => {
  console.warn("DEPRECATED: metabase/redux/metadata addRemappings");
  return fields.actions.addRemappings({ id: fieldId }, remappings);
};
// const ADD_REMAPPINGS = "metabase/metadata/ADD_REMAPPINGS";
// export const addRemappings = createAction(
//   ADD_REMAPPINGS,
//   (fieldId, remappings) => ({ fieldId, remappings }),
// );

const FETCH_REMAPPING = "metabase/metadata/FETCH_REMAPPING";
export const fetchRemapping = createThunkAction(
  FETCH_REMAPPING,
  (value, fieldId) => async (dispatch, getState) => {
    const metadata = getMetadata(getState());
    const field = metadata.fields[fieldId];
    const remappedField = field && field.remappedField();
    if (field && remappedField && !field.hasRemappedValue(value)) {
      const fieldId = (field.target || field).id;
      const remappedFieldId = remappedField.id;
      fetchData({
        dispatch,
        getState,
        requestStatePath: [
          "entities",
          "remapping",
          fieldId,
          JSON.stringify(value),
        ],
        getData: async () => {
          const remapping = await MetabaseApi.field_remapping({
            value,
            fieldId,
            remappedFieldId,
          });
          if (remapping) {
            // FIXME: should this be field.id (potentially the FK) or fieldId (always the PK)?
            dispatch(addRemappings(field.id, [remapping]));
          }
        },
      });
    }
  },
);

const FETCH_REAL_DATABASES_WITH_METADATA =
  "metabase/metadata/FETCH_REAL_DATABASES_WITH_METADATA";
export const fetchRealDatabasesWithMetadata = createThunkAction(
  FETCH_REAL_DATABASES_WITH_METADATA,
  (reload = false) => {
    return async (dispatch, getState) => {
      await dispatch(fetchRealDatabases());
      const databases = getIn(getState(), ["entities", "databases"]);
      await Promise.all(
        Object.values(databases).map(database =>
          dispatch(fetchDatabaseMetadata(database.id)),
        ),
      );
    };
  },
);

// const databases = handleActions({}, {});

// const databasesList = handleActions(
//   {
//     [FETCH_DATABASES]: {
//       next: (state, { payload }) => (payload && payload.result) || state,
//     },
//   },
//   [],
// );

// const tables = handleActions({}, {});

// const fields = handleActions(
//   {
//     [FETCH_FIELD_VALUES]: {
//       next: (state, { payload: fieldValues }) =>
//         fieldValues
//           ? assocIn(state, [fieldValues.field_id, "values"], fieldValues.values)
//           : state,
//     },
//     [ADD_PARAM_VALUES]: {
//       next: (state, { payload: paramValues }) => {
//         for (const fieldValues of Object.values(paramValues)) {
//           state = assocIn(state, [fieldValues.field_id, "values"], fieldValues);
//         }
//         return state;
//       },
//     },
//     [ADD_REMAPPINGS]: (state, { payload: { fieldId, remappings } }) =>
//       updateIn(state, [fieldId, "remappings"], (existing = []) =>
//         Array.from(new Map(existing.concat(remappings))),
//       ),
//   },
//   {},
// );

// const metrics = handleActions({}, {});

// const segments = handleActions({}, {});

// const revisions = handleActions(
//   {
//     [FETCH_REVISIONS]: { next: (state, { payload }) => payload },
//   },
//   {},
// );

// export default combineReducers({
//   // metrics: handleEntities(/^metabase\/metadata\//, "metrics", metrics),
//   // segments: handleEntities(/^metabase\/metadata\//, "segments", segments),
//   // databases: handleEntities(/^metabase\/metadata\//, "databases", databases),
//   // tables: handleEntities(/^metabase\/metadata\//, "tables", tables),
//   // fields: handleEntities(/^metabase\/metadata\//, "fields", fields),
//   revisions,
//   // databasesList,
// });
