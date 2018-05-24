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

const deprecated = message => console.warn("DEPRECATED: " + message);

export const FETCH_METRICS = metrics.actions.fetchList.toString();
export const fetchMetrics = (reload = false) => {
  deprecated("metabase/redux/metadata fetchMetrics");
  return metrics.actions.fetchList(null, reload);
};

export const updateMetric = metric => {
  deprecated("metabase/redux/metadata updateMetric");
  return metrics.actions.update(metric);
};

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
  deprecated("metabase/redux/metadata fetchSegments");
  return segments.actions.fetchList(null, reload);
};

export const updateSegment = segment => {
  deprecated("metabase/redux/metadata updateSegment");
  return segments.actions.update(segment);
};

export const FETCH_DATABASES = databases.actions.fetchList.toString();
export const fetchDatabases = (reload = false) => {
  deprecated("metabase/redux/metadata fetchDatabases");
  return databases.actions.fetchList(
    {
      include_tables: true,
      include_cards: true,
    },
    reload,
  );
};

export const FETCH_REAL_DATABASES = databases.actions.fetchList.toString();
export const fetchRealDatabases = (reload = false) => {
  deprecated("metabase/redux/metadata fetchRealDatabases");
  return databases.actions.fetchList(
    {
      include_tables: true,
      include_cards: false,
    },
    reload,
  );
};

export const FETCH_DATABASE_METADATA = databases.actions.fetchDatabaseMetadata.toString();
export const fetchDatabaseMetadata = (dbId, reload = false) => {
  deprecated("metabase/redux/metadata fetchDatabaseMetadata");
  return databases.actions.fetchDatabaseMetadata({ id: dbId }, reload);
};

export const updateDatabase = database => {
  deprecated("metabase/redux/metadata updateDatabase");
  const slimDatabase = _.omit(database, "tables", "tables_lookup");
  return database.actions.update(slimDatabase);
};

export const updateTable = table => {
  deprecated("metabase/redux/metadata updateTable");
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

export const fetchTables = (reload = false) => {
  deprecated("metabase/redux/metadata fetchTables");
  return tables.actions.fetchList(null, reload);
};

export { FETCH_TABLE_METADATA } from "metabase/entities/tables";
export const fetchTableMetadata = (tableId, reload = false) => {
  deprecated("metabase/redux/metadata fetchTableMetadata");
  return tables.actions.fetchTableMetadata({ id: tableId }, reload);
};

export const fetchField = (id, reload = false) => {
  deprecated("metabase/redux/metadata fetchField");
  return fields.actions.fetch({ id }, reload);
};

export const FETCH_FIELD_VALUES = fields.actions.fetchFieldValues.toString();
export const fetchFieldValues = (fieldId, reload) => {
  deprecated("metabase/redux/metadata fetchFieldValues");
  return fields.actions.fetchFieldValues({ id: fieldId }, reload);
};

export const UPDATE_FIELD_VALUES = fields.actions.updateFieldValues.toString();
export const updateFieldValues = (fieldId, fieldValuePairs) => {
  deprecated("metabase/redux/metadata updateFieldValues");
  return fields.actions.updateFieldValues({ id: fieldId }, fieldValuePairs);
};

export { ADD_PARAM_VALUES } from "metabase/entities/fields";
export const addParamValues = paramValues => {
  deprecated("metabase/redux/metadata addParamValues");
  return fields.actions.addParamValues(paramValues);
};

export { ADD_FIELDS } from "metabase/entities/fields";
export const addFields = fieldMaps => {
  deprecated("metabase/redux/metadata addFields");
  return fields.actions.addFields(fieldMaps);
};

export const UPDATE_FIELD = fields.actions.update.toString();
export const updateField = field => {
  deprecated("metabase/redux/metadata updateField");
  const slimField = _.omit(field, "operators_lookup");
  return fields.actions.update(slimField);
};

export const DELETE_FIELD_DIMENSION = fields.actions.deleteFieldDimension.toString();
export const deleteFieldDimension = fieldId => {
  deprecated("metabase/redux/metadata deleteFieldDimension");
  return fields.actions.deleteFieldDimension({ id: fieldId });
};

export const UPDATE_FIELD_DIMENSION = fields.actions.updateFieldDimension.toString();
export const updateFieldDimension = (fieldId, dimension) => {
  deprecated("metabase/redux/metadata updateFieldDimension");
  return fields.actions.updateFieldDimension({ id: fieldId }, dimension);
};

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
  deprecated("metabase/redux/metadata addRemappings");
  return fields.actions.addRemappings({ id: fieldId }, remappings);
};

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
