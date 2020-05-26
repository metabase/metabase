/* @flow weak */

import { normalize } from "normalizr";
import _ from "underscore";

import { createEntity } from "metabase/lib/entities";
import { fetchData, createThunkAction } from "metabase/lib/redux";

import { MetabaseApi } from "metabase/services";
import { DatabaseSchema } from "metabase/schema";
import Fields from "metabase/entities/fields";
import Schemas from "metabase/entities/schemas";

import { getMetadata, getFields } from "metabase/selectors/metadata";
import { createSelector } from "reselect";

import forms from "./databases/forms";

// OBJECT ACTIONS
export const FETCH_DATABASE_METADATA =
  "metabase/entities/database/FETCH_DATABASE_METADATA";

export const FETCH_DATABASE_SCHEMAS =
  "metabase/entities/database/FETCH_DATABASE_SCHEMAS";
export const FETCH_DATABASE_IDFIELDS =
  "metabase/entities/database/FETCH_DATABASE_IDFIELDS";

const Databases = createEntity({
  name: "databases",
  path: "/api/database",
  schema: DatabaseSchema,

  nameOne: "database",
  nameMany: "databases",

  // ACTION CREATORS
  objectActions: {
    fetchDatabaseMetadata: createThunkAction(
      FETCH_DATABASE_METADATA,
      ({ id }, { reload = false, params } = {}) => (dispatch, getState) =>
        fetchData({
          dispatch,
          getState,
          requestStatePath: ["metadata", "databases", id],
          existingStatePath: ["metadata", "databases", id],
          getData: async () => {
            const databaseMetadata = await MetabaseApi.db_metadata({
              dbId: id,
              ...params,
            });
            return normalize(databaseMetadata, DatabaseSchema);
          },
          reload,
        }),
    ),

    fetchIdfields: createThunkAction(
      FETCH_DATABASE_IDFIELDS,
      ({ id }) => async () =>
        normalize(await MetabaseApi.db_idfields({ dbId: id }), [Fields.schema]),
    ),

    fetchSchemas: ({ id }) => Schemas.actions.fetchList({ dbId: id }),
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).database(entityId),

    getHasSampleDataset: state =>
      _.any(Databases.selectors.getList(state), db => db.is_sample),
    getIdfields: createSelector(
      // we wrap getFields to handle a circular dep issue
      [state => getFields(state), (state, props) => props.databaseId],
      (fields, databaseId) =>
        Object.values(fields).filter(f => {
          const { db_id } = f.table || {}; // a field's table can be null
          return db_id === databaseId && f.isPK();
        }),
    ),
  },

  // FORM
  forms,
});

export default Databases;
