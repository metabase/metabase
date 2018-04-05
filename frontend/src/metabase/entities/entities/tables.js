import { normalize } from "normalizr";
import { createThunkAction, fetchData } from "metabase/lib/redux";
import { MetabaseApi } from "metabase/services";
import { FieldSchema, TableSchema } from "metabase/schema";
import _ from "underscore";

// DEFINITION

export const name = "tables";
export const path = "/api/table";
export const schema = FieldSchema;

// OBJECT ACTIONS

export const FETCH_TABLE_METADATA = "metabase/entities/FETCH_TABLE_METADATA";

// ACTION CREATORS

export const objectActions = {
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
};
