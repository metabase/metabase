/* @flow weak */

import { normalize } from "normalizr";
import { fetchData, createThunkAction } from "metabase/lib/redux";

import { MetabaseApi } from "metabase/services";
import { DatabaseSchema } from "metabase/schema";

// ENTITY DEFINITION

export const name = "databases";
export const path = "/api/database";
export const schema = DatabaseSchema;

// OBJECT ACTIONS

export const FETCH_DATABASE_METADATA =
  "metabase/entities/database/FETCH_DATABASE_METADATA";

// ACTION CREATORS

export const objectActions = {
  fetchDatabaseMetadata: createThunkAction(
    FETCH_DATABASE_METADATA,
    ({ id }, reload = false) => (dispatch, getState) =>
      fetchData({
        dispatch,
        getState,
        requestStatePath: ["metadata", "databases", id],
        existingStatePath: ["metadata", "databases", id],
        getData: async () => {
          const databaseMetadata = await MetabaseApi.db_metadata({ dbId: id });
          return normalize(databaseMetadata, DatabaseSchema);
        },
        reload,
      }),
  ),
};

// FORM

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
export const form = {
  fields: (values = {}) => [
    { name: "name" },
    { name: "engine", type: "select", options: ENGINE_OPTIONS },
    ...(FIELDS_BY_ENGINE[values.engine] || []),
  ],
};
