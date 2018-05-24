/* @flow weak */

import { createEntity } from "metabase/lib/entities";
import { fetchData, createThunkAction } from "metabase/lib/redux";
import { normalize } from "normalizr";

import { MetabaseApi } from "metabase/services";
import { DatabaseSchema } from "metabase/schema";

// OBJECT ACTIONS
export const FETCH_DATABASE_METADATA =
  "metabase/entities/database/FETCH_DATABASE_METADATA";

export default createEntity({
  name: "databases",
  path: "/api/database",
  schema: DatabaseSchema,

  // ACTION CREATORS
  objectActions: {
    fetchDatabaseMetadata: createThunkAction(
      FETCH_DATABASE_METADATA,
      ({ id }, reload = false) => (dispatch, getState) =>
        fetchData({
          dispatch,
          getState,
          requestStatePath: ["metadata", "databases", id],
          existingStatePath: ["metadata", "databases", id],
          getData: async () => {
            const databaseMetadata = await MetabaseApi.db_metadata({
              dbId: id,
            });
            return normalize(databaseMetadata, DatabaseSchema);
          },
          reload,
        }),
    ),
  },

  // FORM
  form: {
    fields: (values = {}) => [
      { name: "name" },
      { name: "engine", type: "select", options: ENGINE_OPTIONS },
      ...(FIELDS_BY_ENGINE[values.engine] || []),
    ],
  },
});

// TODO: use the info returned by the backend
const FIELDS_BY_ENGINE = {
  h2: [{ name: "details.db" }],
  postgres: [
    { name: "details.host" },
    { name: "details.port" },
    { name: "details.dbname" },
    { name: "details.user" },
    { name: "details.password", type: "password" },
  ],
};

const ENGINE_OPTIONS = Object.keys(FIELDS_BY_ENGINE).map(key => ({
  name: key,
  value: key,
}));
