import { createThunkAction, fetchData, updateData } from "metabase/lib/redux";

import { getIn } from "icepick";
import _ from "underscore";

import { getMetadata } from "metabase/selectors/metadata";

import { MetabaseApi, MetricApi, RevisionsApi } from "metabase/services";

import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";
import Fields from "metabase/entities/fields";
import Segments from "metabase/entities/segments";
import Metrics from "metabase/entities/metrics";

// NOTE: All of these actions are deprecated. Use metadata entities directly.

const deprecated = message => console.warn("DEPRECATED: " + message);

export const FETCH_METRICS = Metrics.actions.fetchList.toString();
export const fetchMetrics = (reload = false) => {
  deprecated("metabase/redux/metadata fetchMetrics");
  return Metrics.actions.fetchList(null, { reload });
};

export const updateMetric = metric => {
  deprecated("metabase/redux/metadata updateMetric");
  return Metrics.actions.update(metric);
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

export const FETCH_SEGMENTS = Segments.actions.fetchList.toString();
export const fetchSegments = (reload = false) => {
  deprecated("metabase/redux/metadata fetchSegments");
  return Segments.actions.fetchList(null, { reload });
};

export const updateSegment = segment => {
  deprecated("metabase/redux/metadata updateSegment");
  return Segments.actions.update(segment);
};

export const FETCH_REAL_DATABASES = Databases.actions.fetchList.toString();
export const fetchRealDatabases = (reload = false) => {
  deprecated("metabase/redux/metadata fetchRealDatabases");
  return Databases.actions.fetchList({ include: "tables" }, { reload });
};

export const FETCH_DATABASE_METADATA = Databases.actions.fetchDatabaseMetadata.toString();
export const fetchDatabaseMetadata = (dbId, reload = false) => {
  deprecated("metabase/redux/metadata fetchDatabaseMetadata");
  return Databases.actions.fetchDatabaseMetadata({ id: dbId }, { reload });
};

export const updateDatabase = database => {
  deprecated("metabase/redux/metadata updateDatabase");
  const slimDatabase = _.omit(database, "tables", "tables_lookup");
  return Databases.actions.update(slimDatabase);
};

export const updateTable = table => {
  deprecated("metabase/redux/metadata updateTable");
  const slimTable = _.omit(
    table,
    "fields",
    "fields_lookup",
    "aggregation_operators",
    "metrics",
    "segments",
  );
  return Tables.actions.update(slimTable);
};

export const fetchTables = (reload = false) => {
  deprecated("metabase/redux/metadata fetchTables");
  return Tables.actions.fetchList(null, { reload });
};

export { FETCH_TABLE_METADATA } from "metabase/entities/tables";
export const fetchTableMetadata = (id, reload = false) => {
  deprecated("metabase/redux/metadata fetchTableMetadata");
  return Tables.actions.fetchMetadataAndForeignTables({ id }, { reload });
};

export const fetchField = (id, reload = false) => {
  deprecated("metabase/redux/metadata fetchField");
  return Fields.actions.fetch({ id }, { reload });
};

export const FETCH_FIELD_VALUES = Fields.actions.fetchFieldValues.toString();
export const fetchFieldValues = (id, reload = false) => {
  deprecated("metabase/redux/metadata fetchFieldValues");
  return Fields.actions.fetchFieldValues({ id }, reload);
};

export const UPDATE_FIELD_VALUES = Fields.actions.updateFieldValues.toString();
export const updateFieldValues = (fieldId, fieldValuePairs) => {
  deprecated("metabase/redux/metadata updateFieldValues");
  return Fields.actions.updateFieldValues({ id: fieldId }, fieldValuePairs);
};

export { ADD_PARAM_VALUES } from "metabase/entities/fields";
export const addParamValues = paramValues => {
  deprecated("metabase/redux/metadata addParamValues");
  return Fields.actions.addParamValues(paramValues);
};

export { ADD_FIELDS } from "metabase/entities/fields";
export const addFields = fieldMaps => {
  deprecated("metabase/redux/metadata addFields");
  return Fields.actions.addFields(fieldMaps);
};

export const UPDATE_FIELD = Fields.actions.update.toString();
export const updateField = field => {
  deprecated("metabase/redux/metadata updateField");
  const slimField = _.omit(field, "filter_operators_lookup");
  return Fields.actions.update(slimField);
};

export const DELETE_FIELD_DIMENSION = Fields.actions.deleteFieldDimension.toString();
export const deleteFieldDimension = fieldId => {
  deprecated("metabase/redux/metadata deleteFieldDimension");
  return Fields.actions.deleteFieldDimension({ id: fieldId });
};

export const UPDATE_FIELD_DIMENSION = Fields.actions.updateFieldDimension.toString();
export const updateFieldDimension = (fieldId, dimension) => {
  deprecated("metabase/redux/metadata updateFieldDimension");
  return Fields.actions.updateFieldDimension({ id: fieldId }, dimension);
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

export const addRemappings = (fieldId, remappings) => {
  deprecated("metabase/redux/metadata addRemappings");
  return Fields.actions.addRemappings({ id: fieldId }, remappings);
};

const FETCH_REMAPPING = "metabase/metadata/FETCH_REMAPPING";
export const fetchRemapping = createThunkAction(
  FETCH_REMAPPING,
  (value, fieldId) => async (dispatch, getState) => {
    const metadata = getMetadata(getState());
    const field = metadata.field(fieldId);
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

export const loadMetadataForQuery = query => loadMetadataForQueries([query]);

export const loadMetadataForQueries = queries => dispatch =>
  Promise.all(
    _.chain(queries)
      .map(q => q.dependentMetadata())
      .flatten()
      .uniq(false, dep => dep.type + dep.id)
      .map(({ type, id, foreignTables }) => {
        if (type === "table") {
          return (foreignTables
            ? Tables.actions.fetchMetadataAndForeignTables
            : Tables.actions.fetchMetadata)({ id });
        } else {
          console.warn(`loadMetadataForQueries: type ${type} not implemented`);
        }
      })
      // unrecognized types would result in undefined, so we filter that out
      .filter(action => action !== undefined)
      .map(dispatch)
      .value(),
  ).catch(e => console.error("Failed loading metadata for query", e));
