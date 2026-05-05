import { updateIn } from "icepick";

import { cardApi, useGetCardQuery, useListCardsQuery } from "metabase/api";
import { getCollectionType } from "metabase/entities/collections";
import { SOFT_RELOAD_CARD } from "metabase/redux/query-builder";
import {
  getMetadata,
  getMetadataUnfiltered,
} from "metabase/selectors/metadata";

import { createEntity, entityCompatibleQuery } from "./utils";

export const INJECT_RTK_QUERY_QUESTION_VALUE =
  "metabase/entities/questions/FETCH_ADHOC_METADATA";

/**
 * @deprecated use "metabase/api" instead
 */
export const Questions = createEntity({
  name: "questions",
  nameOne: "question",
  path: "/api/card",

  rtk: () => ({
    getUseGetQuery: () => ({
      useGetQuery: useGetCardQuery,
    }),
    useListQuery: useListCardsQuery,
  }),

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(entityQuery, dispatch, cardApi.endpoints.listCards),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        { ...entityQuery, ignore_error: options?.noEvent },
        dispatch,
        cardApi.endpoints.getCard,
      ),
    create: (entityQuery, dispatch) => {
      const { collection_id, dashboard_id, dashboard_tab_id, ...rest } =
        entityQuery;

      const destination = dashboard_id
        ? { dashboard_id, dashboard_tab_id }
        : { collection_id };

      return entityCompatibleQuery(
        { ...rest, ...destination },
        dispatch,
        cardApi.endpoints.createCard,
      );
    },
    update: (entityQuery, dispatch) => {
      return entityCompatibleQuery(
        entityQuery,
        dispatch,
        cardApi.endpoints.updateCard,
      );
    },
    delete: ({ id }, dispatch) =>
      entityCompatibleQuery(id, dispatch, cardApi.endpoints.deleteCard),
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).question(entityId),
    getObjectUnfiltered: (state, { entityId }) =>
      getMetadataUnfiltered(state).question(entityId),
    getListUnfiltered: (state, { entityQuery }) => {
      const entityIds =
        Questions.selectors.getEntityIds(state, { entityQuery }) ?? [];
      return entityIds.map((entityId) =>
        Questions.selectors.getObjectUnfiltered(state, { entityId }),
      );
    },
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === SOFT_RELOAD_CARD) {
      const { id } = payload;
      const latestReview = payload.moderation_reviews?.find(
        (x) => x.most_recent,
      );

      if (latestReview) {
        return updateIn(state, [id], (question) => ({
          ...question,
          moderated_status: latestReview.status,
        }));
      }
    }

    if (type === INJECT_RTK_QUERY_QUESTION_VALUE) {
      const { id } = payload;

      return updateIn(state, [id], (question) => ({ ...question, ...payload }));
    }
    return state;
  },

  // NOTE: keep in sync with src/metabase/queries_rest/api/card.clj
  writableProperties: [
    "name",
    "cache_ttl",
    "type",
    "dataset_query",
    "display",
    "description",
    "visualization_settings",
    "parameters",
    "parameter_mappings",
    "archived",
    "enable_embedding",
    "embedding_params",
    "collection_id",
    "dashboard_id",
    "dashboard_tab_id",
    "collection_position",
    "collection_preview",
    "result_metadata",
    "delete_old_dashcards",
  ],

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },
});
