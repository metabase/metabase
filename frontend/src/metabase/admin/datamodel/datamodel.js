import _ from "underscore";

import {
  handleActions,
  combineReducers,
  createAction,
  createThunkAction,
  momentifyTimestamps,
} from "metabase/lib/redux";
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { loadTableAndForeignKeys } from "metabase/lib/table";

import {
  MetabaseApi,
  SegmentApi,
  MetricApi,
  RevisionsApi,
} from "metabase/services";

import { getEditingDatabase } from "./selectors";

function loadDatabaseMetadata(databaseId) {
  return MetabaseApi.db_metadata({ dbId: databaseId });
}

// initializeMetadata
export const INITIALIZE_METADATA =
  "metabase/admin/datamodel/INITIALIZE_METADATA";
export const initializeMetadata = createThunkAction(
  INITIALIZE_METADATA,
  function(databaseId, tableId) {
    return async function(dispatch, getState) {
      let databases, database;
      try {
        databases = await MetabaseApi.db_list();
      } catch (error) {
        console.log("error fetching databases", error);
      }

      // initialize a database
      if (databases && !_.isEmpty(databases)) {
        let db = databaseId
          ? _.findWhere(databases, { id: databaseId })
          : databases[0];

        database = await loadDatabaseMetadata(db.id);
      }

      if (database) {
        dispatch(fetchDatabaseIdfields(database.id));
      }

      return {
        databases,
        database,
        tableId,
      };
    };
  },
);

// fetchDatabaseIdfields
export const FETCH_IDFIELDS = "metabase/admin/datamodel/FETCH_IDFIELDS";
export const fetchDatabaseIdfields = createThunkAction(FETCH_IDFIELDS, function(
  databaseId,
) {
  return async function(dispatch, getState) {
    try {
      let idfields = await MetabaseApi.db_idfields({ dbId: databaseId });
      return idfields.map(function(field) {
        field.displayName =
          field.table.display_name + " → " + field.display_name;
        return field;
      });
    } catch (error) {
      console.warn("error getting idfields", databaseId, error);
    }
  };
});

// selectDatabase
export const SELECT_DATABASE = "metabase/admin/datamodel/SELECT_DATABASE";
export const selectDatabase = createThunkAction(SELECT_DATABASE, function(db) {
  return async function(dispatch, getState) {
    try {
      let database = await loadDatabaseMetadata(db.id);

      dispatch(fetchDatabaseIdfields(db.id));

      // we also want to update our url to match our new state
      dispatch(push("/admin/datamodel/database/" + db.id));

      return database;
    } catch (error) {
      console.log("error fetching tables", db.id, error);
    }
  };
});

// selectTable
export const SELECT_TABLE = "metabase/admin/datamodel/SELECT_TABLE";
export const selectTable = createThunkAction(SELECT_TABLE, function(table) {
  return function(dispatch, getState) {
    // we also want to update our url to match our new state
    dispatch(
      push("/admin/datamodel/database/" + table.db_id + "/table/" + table.id),
    );

    return table.id;
  };
});

// updateTable
export const UPDATE_TABLE = "metabase/admin/datamodel/UPDATE_TABLE";
export const updateTable = createThunkAction(UPDATE_TABLE, function(table) {
  return async function(dispatch, getState) {
    try {
      // make sure we don't send all the computed metadata
      let slimTable = { ...table };
      slimTable = _.omit(
        slimTable,
        "fields",
        "fields_lookup",
        "aggregation_options",
        "breakout_options",
        "metrics",
        "segments",
      );

      let updatedTable = await MetabaseApi.table_update(slimTable);
      _.each(updatedTable, (value, key) => {
        if (key.charAt(0) !== "$") {
          updatedTable[key] = value;
        }
      });

      MetabaseAnalytics.trackEvent("Data Model", "Update Table");

      // TODO: we are not actually using this because the way the react components works actually mutates the original object :(
      return updatedTable;
    } catch (error) {
      console.log("error updating table", error);
      //MetabaseAnalytics.trackEvent("Databases", database.id ? "Update Failed" : "Create Failed", database.engine);
    }
  };
});

// updateField
export const UPDATE_FIELD = "metabase/admin/datamodel/UPDATE_FIELD";
export const updateField = createThunkAction(UPDATE_FIELD, function(field) {
  return async function(dispatch, getState) {
    const editingDatabase = getEditingDatabase(getState());

    try {
      // make sure we don't send all the computed metadata
      let slimField = { ...field };
      slimField = _.omit(slimField, "operators_lookup", "operators", "values");

      // update the field
      let updatedField = await MetabaseApi.field_update(slimField);

      // refresh idfields
      let table = _.findWhere(editingDatabase.tables, {
        id: updatedField.table_id,
      });
      dispatch(fetchDatabaseIdfields(table.db_id));

      MetabaseAnalytics.trackEvent("Data Model", "Update Field");

      // TODO: we are not actually using this because the way the react components works actually mutates the original object :(
      return updatedField;
    } catch (error) {
      console.log("error updating field", error);
      //MetabaseAnalytics.trackEvent("Databases", database.id ? "Update Failed" : "Create Failed", database.engine);
    }
  };
});

// retireSegment
export const RETIRE_SEGMENT = "metabase/admin/datamodel/RETIRE_SEGMENT";
export const onRetireSegment = createThunkAction(RETIRE_SEGMENT, function(
  segment,
) {
  return async function(dispatch, getState) {
    const editingDatabase = getEditingDatabase(getState());

    await SegmentApi.delete(segment);
    MetabaseAnalytics.trackEvent("Data Model", "Retire Segment");

    return await loadDatabaseMetadata(editingDatabase.id);
  };
});

// retireMetric
export const RETIRE_METRIC = "metabase/admin/datamodel/RETIRE_METRIC";
export const onRetireMetric = createThunkAction(RETIRE_METRIC, function(
  metric,
) {
  return async function(dispatch, getState) {
    const editingDatabase = getEditingDatabase(getState());

    await MetricApi.delete(metric);
    MetabaseAnalytics.trackEvent("Data Model", "Retire Metric");

    return await loadDatabaseMetadata(editingDatabase.id);
  };
});

// SEGMENTS

export const GET_SEGMENT = "metabase/admin/datamodel/GET_SEGMENT";
export const CREATE_SEGMENT = "metabase/admin/datamodel/CREATE_SEGMENT";
export const UPDATE_SEGMENT = "metabase/admin/datamodel/UPDATE_SEGMENT";
export const DELETE_SEGMENT = "metabase/admin/datamodel/DELETE_SEGMENT";

export const getSegment = createAction(GET_SEGMENT, SegmentApi.get);
export const createSegment = createAction(CREATE_SEGMENT, SegmentApi.create);
export const updateSegment = createAction(UPDATE_SEGMENT, SegmentApi.update);
export const deleteSegment = createAction(DELETE_SEGMENT, SegmentApi.delete);

// METRICS

export const GET_METRIC = "metabase/admin/datamodel/GET_METRIC";
export const CREATE_METRIC = "metabase/admin/datamodel/CREATE_METRIC";
export const UPDATE_METRIC = "metabase/admin/datamodel/UPDATE_METRIC";
export const DELETE_METRIC = "metabase/admin/datamodel/DELETE_METRIC";

export const getMetric = createAction(GET_METRIC, MetricApi.get);
export const createMetric = createAction(CREATE_METRIC, MetricApi.create);
export const updateMetric = createAction(UPDATE_METRIC, MetricApi.update);
export const deleteMetric = createAction(DELETE_METRIC, MetricApi.delete);

// SEGMENT DETAIL

export const LOAD_TABLE_METADATA =
  "metabase/admin/datamodel/LOAD_TABLE_METADATA";
export const UPDATE_PREVIEW_SUMMARY =
  "metabase/admin/datamodel/UPDATE_PREVIEW_SUMMARY";

export const loadTableMetadata = createAction(
  LOAD_TABLE_METADATA,
  loadTableAndForeignKeys,
);
export const updatePreviewSummary = createAction(
  UPDATE_PREVIEW_SUMMARY,
  async query => {
    let result = await MetabaseApi.dataset(query);
    return result.data.rows[0][0];
  },
);

// REVISION HISTORY

export const FETCH_REVISIONS = "metabase/admin/datamodel/FETCH_REVISIONS";

export const fetchRevisions = createThunkAction(
  FETCH_REVISIONS,
  ({ entity, id }) => async (dispatch, getState) => {
    let action;
    switch (entity) {
      case "segment":
        action = getSegment({ segmentId: id });
        break;
      case "metric":
        action = getMetric({ metricId: id });
        break;
    }
    let [object, revisions] = await Promise.all([
      dispatch(action),
      RevisionsApi.get({ entity, id }),
    ]);
    await dispatch(
      loadTableMetadata(object.payload.definition["source-table"]),
    );
    return { object: object.payload, revisions };
  },
);

// reducers

const databases = handleActions(
  {
    [INITIALIZE_METADATA]: { next: (state, { payload }) => payload.databases },
  },
  [],
);

const idfields = handleActions(
  {
    [FETCH_IDFIELDS]: {
      next: (state, { payload }) => (payload ? payload : state),
    },
  },
  [],
);

const editingDatabase = handleActions(
  {
    [INITIALIZE_METADATA]: { next: (state, { payload }) => payload.database },
    [SELECT_DATABASE]: {
      next: (state, { payload }) => (payload ? payload : state),
    },
    [RETIRE_SEGMENT]: { next: (state, { payload }) => payload },
    [RETIRE_METRIC]: { next: (state, { payload }) => payload },
  },
  null,
);

const editingTable = handleActions(
  {
    [INITIALIZE_METADATA]: {
      next: (state, { payload }) => payload.tableId || null,
    },
    [SELECT_TABLE]: { next: (state, { payload }) => payload },
  },
  null,
);

const segments = handleActions(
  {
    [GET_SEGMENT]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.id]: momentifyTimestamps(payload),
      }),
    },
    [CREATE_SEGMENT]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.id]: momentifyTimestamps(payload),
      }),
    },
    [UPDATE_SEGMENT]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.id]: momentifyTimestamps(payload),
      }),
    },
    [DELETE_SEGMENT]: {
      next: (state, { payload }) => {
        state = { ...state };
        delete state[payload.id];
        return state;
      },
    },
  },
  {},
);

const metrics = handleActions(
  {
    [GET_METRIC]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.id]: momentifyTimestamps(payload),
      }),
    },
    [CREATE_METRIC]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.id]: momentifyTimestamps(payload),
      }),
    },
    [UPDATE_METRIC]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.id]: momentifyTimestamps(payload),
      }),
    },
    [DELETE_METRIC]: {
      next: (state, { payload }) => {
        state = { ...state };
        delete state[payload.id];
        return state;
      },
    },
  },
  {},
);

const tableMetadata = handleActions(
  {
    [LOAD_TABLE_METADATA]: {
      next: (state, { payload }) =>
        payload && payload.table ? payload.table : null,
      throw: (state, action) => null,
    },
  },
  null,
);

const previewSummary = handleActions(
  {
    [UPDATE_PREVIEW_SUMMARY]: { next: (state, { payload }) => payload },
  },
  null,
);

const revisionObject = handleActions(
  {
    [FETCH_REVISIONS]: {
      next: (state, { payload: revisionObject }) => revisionObject,
    },
  },
  null,
);

export default combineReducers({
  databases,
  idfields,
  editingDatabase,
  editingTable,
  segments,
  metrics,
  tableMetadata,
  previewSummary,
  revisionObject,
});
