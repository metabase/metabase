import { createEntity } from "metabase/lib/entities";
import { createThunkAction, fetchData } from "metabase/lib/redux";
import { normalize } from "normalizr";
import _ from "underscore";

import { MetabaseApi } from "metabase/services";
import { TableSchema } from "metabase/schema";

// OBJECT ACTIONS
const FETCH_TABLE_METADATA = "metabase/entities/FETCH_TABLE_METADATA";

export default createEntity({
  name: "tables",
  path: "/api/table",
  schema: TableSchema,

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
});
