import { createEntity } from "metabase/lib/entities";
import {
  createThunkAction,
  compose,
  withAction,
  withCachedDataAndRequestState,
  withNormalize,
} from "metabase/lib/redux";
import _ from "underscore";

import { MetabaseApi } from "metabase/services";
import { TableSchema } from "metabase/schema";

import { GET } from "metabase/lib/api";

const listTables = GET("/api/table");
const listTablesForDatabase = async (...args) =>
  // HACK: no /api/database/:dbId/tables endpoint
  (await GET("/api/database/:dbId/metadata")(...args)).tables.filter(
    /*
     * HACK: Right now the endpoint returns all tables regardless of
     * whether they're hidden. make sure table lists only use non hidden tables
     * Ideally this should live in the API?
     */
    t =>
      t.visibility_type !== "hidden" &&
      t.visibility_type !== "technical" &&
      t.visibility_type !== "cruft",
  );
const listTablesForSchema = GET("/api/database/:dbId/schema/:schemaName");

// OBJECT ACTIONS
export const FETCH_METADATA = "metabase/entities/FETCH_METADATA";
export const FETCH_TABLE_METADATA = "metabase/entities/FETCH_TABLE_METADATA";
export const FETCH_TABLE_FOREIGN_KEYS =
  "metabase/entities/FETCH_TABLE_FOREIGN_KEYS";

const Tables = createEntity({
  name: "tables",
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
    // loads `query_metadata` for a single table
    fetchMetadata: compose(
      withAction(FETCH_METADATA),
      withCachedDataAndRequestState(
        ({ id }) => [...Tables.getObjectStatePath(id)],
        ({ id }) => [...Tables.getObjectStatePath(id), "fetch_query_metadata"],
      ),
      withNormalize(TableSchema),
    )(entityObject => (dispatch, getState) =>
      MetabaseApi.table_query_metadata({ tableId: entityObject.id }),
    ),

    // like fetchMetadata but also loads tables linked by foreign key
    fetchTableMetadata: createThunkAction(
      FETCH_TABLE_METADATA,
      ({ id }, options) => async (dispatch, getState) => {
        await dispatch(Tables.actions.fetchMetadata({ id }, options));
        // fetch foreign key linked table's metadata as well
        const table = Tables.selectors.getObject(getState(), { entityId: id });
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
        ({ id }) => [...Tables.getObjectStatePath(id), "fk"],
      ),
      withNormalize(TableSchema),
    )(entityObject => async (dispatch, getState) => {
      const fks = await MetabaseApi.table_fks({ tableId: entityObject.id });
      return { id: entityObject.id, fks: fks };
    }),
  },

  // FORMS
  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
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
