import { createSelector } from "@reduxjs/toolkit";
import { normalize } from "normalizr";
import _ from "underscore";

import { databaseApi } from "metabase/api";
import { color } from "metabase/lib/colors";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";
import {
  fetchData,
  createThunkAction,
  compose,
  withAction,
  withCachedDataAndRequestState,
  withNormalize,
} from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { DatabaseSchema } from "metabase/schema";
import {
  getMetadata,
  getMetadataUnfiltered,
} from "metabase/selectors/metadata";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";

// OBJECT ACTIONS
export const FETCH_DATABASE_METADATA =
  "metabase/entities/database/FETCH_DATABASE_METADATA";

export const FETCH_DATABASE_SCHEMAS =
  "metabase/entities/database/FETCH_DATABASE_SCHEMAS";
export const FETCH_DATABASE_IDFIELDS =
  "metabase/entities/database/FETCH_DATABASE_IDFIELDS";

/**
 * @deprecated use "metabase/api" instead
 */
const Databases = createEntity({
  name: "databases",
  path: "/api/database",
  schema: DatabaseSchema,

  nameOne: "database",
  nameMany: "databases",

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        databaseApi.endpoints.listDatabases,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        databaseApi.endpoints.getDatabase,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        databaseApi.endpoints.createDatabase,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        databaseApi.endpoints.updateDatabase,
      ),
    delete: ({ id }, dispatch) =>
      entityCompatibleQuery(id, dispatch, databaseApi.endpoints.deleteDatabase),
  },

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
              const databaseMetadata = await entityCompatibleQuery(
                { id, ...params },
                dispatch,
                databaseApi.endpoints.getDatabaseMetadata,
              );
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
      const idFields = await entityCompatibleQuery(
        { id, ...params },
        dispatch,
        databaseApi.endpoints.listDatabaseIdFields,
      );
      return { id, idFields };
    }),
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
      [
        state => getMetadata(state).fieldsList(),
        (state, props) => props.databaseId,
      ],
      (fields, databaseId) =>
        fields.filter(field => {
          const dbId = field?.table?.db_id;
          const isRealField = !isVirtualCardId(field.table_id);
          return dbId === databaseId && isRealField && field.isPK();
        }),
    ),
  },
});

export default Databases;
