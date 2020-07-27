import { createEntity } from "metabase/lib/entities";
import {
  createThunkAction,
  compose,
  withAction,
  withCachedDataAndRequestState,
  withNormalize,
} from "metabase/lib/redux";
import _ from "underscore";

import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import { createSelector } from "reselect";

import { MetabaseApi } from "metabase/services";
import { TableSchema } from "metabase/schema";

import Metrics from "metabase/entities/metrics";
import Segments from "metabase/entities/segments";
import Fields from "metabase/entities/fields";

import { GET, PUT } from "metabase/lib/api";

import { getMetadata } from "metabase/selectors/metadata";

const listTables = GET("/api/table");
const listTablesForDatabase = async (...args) =>
  // HACK: no /api/database/:dbId/tables endpoint
  (await GET("/api/database/:dbId/metadata")(...args)).tables;
const listTablesForSchema = GET("/api/database/:dbId/schema/:schemaName");
const updateFieldOrder = PUT("/api/table/:id/fields/order");
const updateTables = PUT("/api/table");

// OBJECT ACTIONS
export const TABLES_BULK_UPDATE = "metabase/entities/TABLES_BULK_UPDATE";
export const FETCH_METADATA = "metabase/entities/FETCH_METADATA";
export const FETCH_TABLE_METADATA = "metabase/entities/FETCH_TABLE_METADATA";
export const FETCH_TABLE_FOREIGN_KEYS =
  "metabase/entities/FETCH_TABLE_FOREIGN_KEYS";
const UPDATE_TABLE_FIELD_ORDER = "metabase/entities/UPDATE_TABLE_FIELD_ORDER";

const Tables = createEntity({
  name: "tables",
  nameOne: "table",
  path: "/api/table",
  schema: TableSchema,

  api: {
    list: async (params, ...args) => {
      if (params.dbId && params.schemaName) {
        return listTablesForSchema(params, ...args);
      } else if (params.dbId) {
        return listTablesForDatabase(params, ...args);
      } else {
        return listTables(params, ...args);
      }
    },
  },

  actions: {
    // updates all tables in the `ids` key
    bulkUpdate: compose(
      withAction(TABLES_BULK_UPDATE),
      withNormalize([TableSchema]),
    )(updates => async (dispatch, getState) => updateTables(updates)),
  },

  // ACTION CREATORS
  objectActions: {
    // loads `query_metadata` for a single table
    fetchMetadata: compose(
      withAction(FETCH_METADATA),
      withCachedDataAndRequestState(
        ({ id }) => [...Tables.getObjectStatePath(id)],
        ({ id }) => [...Tables.getObjectStatePath(id), "fetchMetadata"],
      ),
      withNormalize(TableSchema),
    )(({ id }, options = {}) => (dispatch, getState) =>
      MetabaseApi.table_query_metadata({
        tableId: id,
        ...options.params,
      }),
    ),

    // like fetchMetadata but also loads tables linked by foreign key
    fetchMetadataAndForeignTables: createThunkAction(
      FETCH_TABLE_METADATA,
      ({ id }, options = {}) => async (dispatch, getState) => {
        await dispatch(Tables.actions.fetchMetadata({ id }, options));
        // fetch foreign key linked table's metadata as well
        const table = Tables.selectors[options.selectorName || "getObject"](
          getState(),
          { entityId: id },
        );
        await Promise.all(
          getTableForeignKeyTableIds(table).map(id =>
            dispatch(Tables.actions.fetchMetadata({ id }, options)),
          ),
        );
      },
    ),

    fetchForeignKeys: compose(
      withAction(FETCH_TABLE_FOREIGN_KEYS),
      withCachedDataAndRequestState(
        ({ id }) => [...Tables.getObjectStatePath(id)],
        ({ id }) => [...Tables.getObjectStatePath(id), "fetchForeignKeys"],
      ),
      withNormalize(TableSchema),
    )(entityObject => async (dispatch, getState) => {
      const fks = await MetabaseApi.table_fks({ tableId: entityObject.id });
      return { id: entityObject.id, fks: fks };
    }),

    setFieldOrder: compose(withAction(UPDATE_TABLE_FIELD_ORDER))(
      ({ id }, fieldOrder) => (dispatch, getState) =>
        updateFieldOrder({ id, fieldOrder }, { bodyParamName: "fieldOrder" }),
    ),
  },

  // FORMS
  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === Segments.actionTypes.CREATE) {
      const { table_id: tableId, id: segmentId } = payload.segment;
      const table = state[tableId];
      if (table) {
        return {
          ...state,
          [tableId]: { ...table, segments: [segmentId, ...table.segments] },
        };
      }
    }

    if (type === Metrics.actionTypes.CREATE) {
      const { table_id: tableId, id: metricId } = payload.metric;
      const table = state[tableId];
      if (table) {
        return {
          ...state,
          [tableId]: { ...table, metrics: [metricId, ...table.metrics] },
        };
      }
    }

    if (type === Segments.actionTypes.UPDATE) {
      const { table_id: tableId, archived, id: segmentId } = payload.segment;
      const table = state[tableId];
      if (archived && table && table.segments) {
        return {
          ...state,
          [tableId]: {
            ...table,
            segments: table.segments.filter(id => id !== segmentId),
          },
        };
      }
    }

    if (type === Metrics.actionTypes.UPDATE) {
      const { table_id: tableId, archived, id: metricId } = payload.metric;
      const table = state[tableId];
      if (archived && table && table.metrics) {
        return {
          ...state,
          [tableId]: {
            ...table,
            metrics: table.metrics.filter(id => id !== metricId),
          },
        };
      }
    }

    return state;
  },
  objectSelectors: {
    getUrl: table =>
      Urls.tableRowsQuery(table.database_id, table.table_id, null),
    getIcon: table => "table",
    getColor: table => color("accent2"),
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).table(entityId),
    // these unfiltered selectors include hidden tables/fields for display in the admin panel
    getObjectUnfiltered: (state, { entityId }) => {
      const table = state.entities.tables[entityId];
      return (
        table && {
          ...table,
          fields: (table.fields || []).map(entityId =>
            Fields.selectors.getObjectUnfiltered(state, { entityId }),
          ),
          metrics: (table.metrics || []).map(id => state.entities.metrics[id]),
          segments: (table.segments || []).map(
            id => state.entities.segments[id],
          ),
        }
      );
    },
    getListUnfiltered: ({ entities }, { entityQuery }) =>
      (entities.tables_list[JSON.stringify(entityQuery)] || []).map(
        id => entities.tables[id],
      ),
    getTable: createSelector(
      // we wrap getMetadata to handle a circular dep issue
      [state => getMetadata(state), (state, props) => props.entityId],
      (metadata, id) => metadata.table(id),
    ),
  },
});

function getTableForeignKeyTableIds(table) {
  return _.chain(table.fields)
    .filter(field => field.target)
    .map(field => field.target.table_id)
    .uniq()
    .value();
}

export default Tables;
