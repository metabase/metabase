import { normalize } from "normalizr";
import _ from "underscore";

import { createSelector } from "@reduxjs/toolkit";
import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";
import {
  fetchData,
  createThunkAction,
  compose,
  withAction,
  withCachedDataAndRequestState,
  withNormalize,
} from "metabase/lib/redux";

import { MetabaseApi } from "metabase/services";
import { DatabaseSchema } from "metabase/schema";
import Schemas from "metabase/entities/schemas";

import {
  getMetadata,
  getMetadataUnfiltered,
} from "metabase/selectors/metadata";

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
      ({ id }, { reload = false, params } = {}) =>
        (dispatch, getState) =>
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

    fetchIdFields: compose(
      withAction(FETCH_DATABASE_IDFIELDS),
      withCachedDataAndRequestState(
        ({ id }) => [...Databases.getObjectStatePath(id)],
        ({ id }) => [...Databases.getObjectStatePath(id), "idFields"],
        entityQuery => Databases.getQueryKey(entityQuery),
      ),
      withNormalize(DatabaseSchema),
    )(({ id, ...params }) => async dispatch => {
      const idFields = await MetabaseApi.db_idfields({ dbId: id, ...params });
      return { id, idFields };
    }),

    fetchSchemas: ({ id }) => Schemas.actions.fetchList({ dbId: id }),
  },

  objectSelectors: {
    getName: db => db && db.name,
    getUrl: db => db && Urls.browseDatabase(db),
    getIcon: db => ({ name: "database" }),
    getColor: db => color("database"),
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).database(entityId),

    // these unfiltered selectors include hidden tables/fields for display in the admin panel
    getObjectUnfiltered: (state, { entityId }) =>
      getMetadataUnfiltered(state).database(entityId),

    getListUnfiltered: (state, { entityQuery }) => {
      const entityIds =
        Databases.selectors.getEntityIds(state, { entityQuery }) ?? [];
      return entityIds.map(entityId =>
        Databases.selectors.getObjectUnfiltered(state, { entityId }),
      );
    },

    getHasSampleDatabase: (state, props) =>
      _.any(Databases.selectors.getList(state, props), db => db.is_sample),

    getIdFields: createSelector(
      [state => getMetadata(state).fields, (state, props) => props.databaseId],
      (fields, databaseId) =>
        Object.values(fields).filter(f => {
          const { db_id } = f.table || {}; // a field's table can be null
          return db_id === databaseId && f.isPK();
        }),
    ),
  },
});

export default Databases;
