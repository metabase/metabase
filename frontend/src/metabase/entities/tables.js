import { t } from "ttag";
import _ from "underscore";
import { createSelector } from "@reduxjs/toolkit";
import { updateIn } from "icepick";
import { createEntity, notify } from "metabase/lib/entities";
import {
  createThunkAction,
  compose,
  withAction,
  withCachedDataAndRequestState,
  withNormalize,
} from "metabase/lib/redux";

import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import { MetabaseApi } from "metabase/services";
import { TableSchema } from "metabase/schema";

import Metrics from "metabase/entities/metrics";
import Segments from "metabase/entities/segments";
import Questions from "metabase/entities/questions";

import { GET, PUT } from "metabase/lib/api";
import {
  getMetadata,
  getMetadataUnfiltered,
} from "metabase/selectors/metadata";
import {
  convertSavedQuestionToVirtualTable,
  getQuestionVirtualTableId,
} from "metabase-lib/metadata/utils/saved-questions";

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
export const UPDATE_TABLE_FIELD_ORDER =
  "metabase/entities/UPDATE_TABLE_FIELD_ORDER";

const Tables = createEntity({
  name: "tables",
  nameOne: "table",
  path: "/api/table",
  schema: TableSchema,

  api: {
    list: async (params, ...args) => {
      if (params.dbId != null && params.schemaName != null) {
        return listTablesForSchema(params, ...args);
      } else if (params.dbId != null) {
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
    updateProperty(entityObject, name, value, opts) {
      return Tables.actions.update(
        entityObject,
        { [name]: value },
        notify(opts, `Table ${name}`, t`updated`),
      );
    },
    // loads `query_metadata` for a single table
    fetchMetadata: compose(
      withAction(FETCH_METADATA),
      withCachedDataAndRequestState(
        ({ id }) => [...Tables.getObjectStatePath(id)],
        ({ id }) => [...Tables.getObjectStatePath(id), "fetchMetadata"],
        entityQuery => Tables.getQueryKey(entityQuery),
      ),
      withNormalize(TableSchema),
    )(
      ({ id, ...params }, options = {}) =>
        (dispatch, getState) =>
          MetabaseApi.table_query_metadata({
            tableId: id,
            ...params,
            ...options.params,
          }),
    ),

    // like fetchMetadata but also loads tables linked by foreign key
    fetchMetadataAndForeignTables: createThunkAction(
      FETCH_TABLE_METADATA,
      ({ id }, options = {}) =>
        async (dispatch, getState) => {
          await dispatch(Tables.actions.fetchMetadata({ id }, options));
          // fetch foreign key linked table's metadata as well
          const table = Tables.selectors[
            options.selectorName || "getObjectUnfiltered"
          ](getState(), { entityId: id });
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
        entityQuery => Tables.getQueryKey(entityQuery),
      ),
      withNormalize(TableSchema),
    )(entityObject => async (dispatch, getState) => {
      const fks = await MetabaseApi.table_fks({ tableId: entityObject.id });
      return { id: entityObject.id, fks: fks };
    }),

    setFieldOrder:
      ({ id }, fieldOrder) =>
      dispatch => {
        dispatch({
          type: UPDATE_TABLE_FIELD_ORDER,
          payload: { id, fieldOrder },
        });
        updateFieldOrder({ id, fieldOrder }, { bodyParamName: "fieldOrder" });
      },
  },

  // FORMS
  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === Questions.actionTypes.CREATE && !error) {
      const card = payload.question;
      const virtualQuestionTable = convertSavedQuestionToVirtualTable(card);

      if (state[virtualQuestionTable.id]) {
        return state;
      }

      return {
        ...state,
        [virtualQuestionTable.id]: virtualQuestionTable,
      };
    }

    if (type === Questions.actionTypes.UPDATE && !error) {
      const card = payload.question;
      const virtualQuestionId = getQuestionVirtualTableId(card.id);

      if (card.archived && state[virtualQuestionId]) {
        delete state[virtualQuestionId];
        return state;
      }

      if (state[virtualQuestionId]) {
        const virtualQuestion = state[virtualQuestionId];
        if (
          virtualQuestion.display_name !== card.name ||
          virtualQuestion.moderated_status !== card.moderated_status ||
          virtualQuestion.description !== card.description
        ) {
          state = updateIn(state, [virtualQuestionId], table => ({
            ...table,
            display_name: card.name,
            moderated_status: card.moderated_status,
            description: card.description,
          }));
        }

        return state;
      }

      return {
        ...state,
        [virtualQuestionId]: convertSavedQuestionToVirtualTable(card),
      };
    }

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

    if (type === Metrics.actionTypes.CREATE && !error) {
      const { table_id: tableId, id: metricId } = payload.metric;
      const table = state[tableId];
      if (table) {
        return {
          ...state,
          [tableId]: { ...table, metrics: [metricId, ...table.metrics] },
        };
      }
    }

    if (type === Segments.actionTypes.UPDATE && !error) {
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

    if (type === UPDATE_TABLE_FIELD_ORDER) {
      const table = state[payload.id];
      if (table) {
        return {
          ...state,
          [table.id]: { ...table, field_order: "custom" },
        };
      }
    }

    return state;
  },
  objectSelectors: {
    getUrl: table =>
      Urls.tableRowsQuery(table.database_id, table.table_id, null),
    getIcon: (table, { variant = "primary" } = {}) => ({
      name: variant === "primary" ? "table" : "database",
    }),
    getColor: table => color("accent2"),
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).table(entityId),
    // these unfiltered selectors include hidden tables/fields for display in the admin panel
    getObjectUnfiltered: (state, { entityId }) =>
      getMetadataUnfiltered(state).table(entityId),
    getListUnfiltered: (state, { entityQuery }) => {
      const entityIds =
        Tables.selectors.getEntityIds(state, { entityQuery }) ?? [];
      return entityIds.map(entityId =>
        Tables.selectors.getObjectUnfiltered(state, { entityId }),
      );
    },
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
