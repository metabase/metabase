import { createEntity } from "metabase/lib/entities";
import { createThunkAction, fetchData } from "metabase/lib/redux";
import { normalize } from "normalizr";
import _ from "underscore";

import { MetabaseApi } from "metabase/services";
import { TableSchema } from "metabase/schema";

import Segments from "metabase/entities/segments";
import Metrics from "metabase/entities/metrics";

import { GET } from "metabase/lib/api";
import { augmentTable } from "metabase/lib/table";

const listTables = GET("/api/table");
const listTablesForDatabase = async (...args) =>
  // HACK: no /api/database/:dbId/tables endpoint
  (await GET("/api/database/:dbId/metadata")(...args)).tables.filter(
    /*
     * HACK: Right now the endpoint returns all tables regardless of
     * whether they're hidden. make sure table lists only use non hidden tables
     * Ideally this should live in the API?
     */
    t => t.visibility_type !== "hidden",
  );
const listTablesForSchema = GET("/api/database/:dbId/schema/:schemaName");

// OBJECT ACTIONS
export const FETCH_TABLE_METADATA = "metabase/entities/FETCH_TABLE_METADATA";

export default createEntity({
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

  // ACTION CREATORS
  objectActions: {
    fetchTableMetadata: createThunkAction(
      FETCH_TABLE_METADATA,
      ({ id }, reload = false) => (dispatch, getState) =>
        fetchData({
          dispatch,
          getState,
          requestStatePath: ["metadata", "tables", id],
          existingStatePath: ["metadata"],
          getData: async () => {
            const tableMetadata = await MetabaseApi.table_query_metadata({
              tableId: id,
            });
            await augmentTable(tableMetadata);
            const fkTableIds = _.chain(tableMetadata.fields)
              .filter(field => field.target)
              .map(field => field.target.table_id)
              .uniq()
              .value();
            const fkTables = await Promise.all(
              fkTableIds.map(tableId =>
                MetabaseApi.table_query_metadata({ tableId }),
              ),
            );
            return normalize([tableMetadata].concat(fkTables), [TableSchema]);
          },
          reload,
        }),
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
      if (archived && table) {
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
      if (archived && table) {
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
});
