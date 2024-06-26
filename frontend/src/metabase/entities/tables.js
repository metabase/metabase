import { createSelector } from "@reduxjs/toolkit";
import { updateIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { databaseApi, tableApi } from "metabase/api";
import Fields from "metabase/entities/fields";
import Questions from "metabase/entities/questions";
import Metrics from "metabase/entities/metrics"; // eslint-disable-line import/order -- circular dependencies
import Segments from "metabase/entities/segments";
import { color } from "metabase/lib/colors";
import {
  createEntity,
  entityCompatibleQuery,
  notify,
} from "metabase/lib/entities";
import {
  compose,
  createThunkAction,
  withAction,
  withCachedDataAndRequestState,
  withNormalize,
} from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { TableSchema } from "metabase/schema";
import {
  getMetadata,
  getMetadataUnfiltered,
} from "metabase/selectors/metadata";
import {
  convertSavedQuestionToVirtualTable,
  getQuestionVirtualTableId,
  getCollectionVirtualSchemaId,
  getCollectionVirtualSchemaName,
} from "metabase-lib/v1/metadata/utils/saved-questions";

// OBJECT ACTIONS
export const TABLES_BULK_UPDATE = "metabase/entities/TABLES_BULK_UPDATE";
export const FETCH_METADATA = "metabase/entities/FETCH_METADATA";
export const FETCH_TABLE_METADATA = "metabase/entities/FETCH_TABLE_METADATA";
export const FETCH_TABLE_FOREIGN_KEYS =
  "metabase/entities/FETCH_TABLE_FOREIGN_KEYS";
export const UPDATE_TABLE_FIELD_ORDER =
  "metabase/entities/UPDATE_TABLE_FIELD_ORDER";

/**
 * @deprecated use "metabase/api" instead
 */
const Tables = createEntity({
  name: "tables",
  nameOne: "table",
  path: "/api/table",
  schema: TableSchema,

  api: {
    list: async ({ dbId, schemaName, ...params } = {}, dispatch) => {
      if (dbId != null && schemaName != null) {
        return entityCompatibleQuery(
          { id: dbId, schema: schemaName, ...params },
          dispatch,
          databaseApi.endpoints.listDatabaseSchemaTables,
        );
      } else if (dbId != null) {
        const database = await entityCompatibleQuery(
          { id: dbId, ...params },
          dispatch,
          databaseApi.endpoints.getDatabaseMetadata,
        );
        return database.tables;
      } else {
        return entityCompatibleQuery(
          params,
          dispatch,
          tableApi.endpoints.listTables,
        );
      }
    },
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(entityQuery, dispatch, tableApi.endpoints.getTable),
  },

  actions: {
    // updates all tables in the `ids` key
    bulkUpdate: compose(
      withAction(TABLES_BULK_UPDATE),
      withNormalize([TableSchema]),
    )(
      updates => async dispatch =>
        entityCompatibleQuery(
          updates,
          dispatch,
          tableApi.endpoints.updateTableList,
        ),
    ),
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
      withNormalize(TableSchema),
    )(
      ({ id, ...params }, options = {}) =>
        dispatch =>
          entityCompatibleQuery(
            { id, ...params, ...options.params },
            dispatch,
            tableApi.endpoints.getTableQueryMetadata,
            { forceRefetch: false },
          ),
    ),

    // fetches table metadata with the request state & caching managed by the entity framework
    // data is not properly cached & invalidated this way, prefer fetchMetadata instead
    // used only to support legacy entity framework loader HoCs
    fetchMetadataDeprecated: compose(
      withAction(FETCH_METADATA),
      withCachedDataAndRequestState(
        ({ id }) => [...Tables.getObjectStatePath(id)],
        ({ id }) => [
          ...Tables.getObjectStatePath(id),
          "fetchMetadataDeprecated",
        ],
        entityQuery => Tables.getQueryKey(entityQuery),
      ),
      withNormalize(TableSchema),
    )(
      ({ id, ...params }, options = {}) =>
        dispatch =>
          entityCompatibleQuery(
            { id, ...params, ...options.params },
            dispatch,
            tableApi.endpoints.getTableQueryMetadata,
          ),
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
          await Promise.all([
            ...getTableForeignKeyTableIds(table).map(id =>
              dispatch(Tables.actions.fetchMetadata({ id }, options)),
            ),
            ...getTableForeignKeyFieldIds(table).map(id =>
              dispatch(Fields.actions.fetch({ id }, options)),
            ),
          ]);
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
    )(({ id }) => async (dispatch, getState) => {
      const fks = await entityCompatibleQuery(
        id,
        dispatch,
        tableApi.endpoints.listTableForeignKeys,
      );
      return { id, fks: fks };
    }),

    setFieldOrder:
      ({ id }, fieldOrder) =>
      dispatch => {
        dispatch({
          type: UPDATE_TABLE_FIELD_ORDER,
          payload: { id, fieldOrder },
        });
        entityCompatibleQuery(
          { id, field_order: fieldOrder },
          dispatch,
          tableApi.endpoints.updateTableFieldsOrder,
        );
      },
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === Fields.actionTypes.UPDATE && !error) {
      const updatedField = payload.field;
      const tableId = updatedField.table_id;
      const table = state[tableId];

      if (table) {
        return {
          ...state,
          [tableId]: {
            ...table,
            original_fields: table.original_fields?.map(field => {
              return field.id === updatedField.id ? updatedField : field;
            }),
          },
        };
      }
    }

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
      const virtualTableId = getQuestionVirtualTableId(card.id);

      if (card.archived && state[virtualTableId]) {
        delete state[virtualTableId];
        return state;
      }

      if (state[virtualTableId]) {
        const virtualTable = state[virtualTableId];
        const virtualSchemaId = getCollectionVirtualSchemaId(card.collection, {
          isDatasets: card.type === "model",
        });
        const virtualSchemaName = getCollectionVirtualSchemaName(
          card.collection,
        );

        if (
          virtualTable.display_name !== card.name ||
          virtualTable.moderated_status !== card.moderated_status ||
          virtualTable.description !== card.description ||
          virtualTable.schema !== virtualSchemaId ||
          virtualTable.schema_name !== virtualSchemaName
        ) {
          state = updateIn(state, [virtualTableId], table => ({
            ...table,
            display_name: card.name,
            moderated_status: card.moderated_status,
            description: card.description,
            schema: virtualSchemaId,
            schema_name: virtualSchemaName,
          }));
        }

        return state;
      }

      return {
        ...state,
        [virtualTableId]: convertSavedQuestionToVirtualTable(card),
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
    .filter(field => field.target != null)
    .map(field => field.target.table_id)
    .uniq()
    .value();
}

// overridden model FK columns have fk_target_field_id but don't have a target
// in this case we load the field instead of the table
function getTableForeignKeyFieldIds(table) {
  return _.chain(table.fields)
    .filter(field => field.target == null && field.fk_target_field_id != null)
    .map(field => field.fk_target_field_id)
    .uniq()
    .value();
}

export default Tables;
