import { updateIn } from "icepick";
import { t } from "ttag";

import { cardApi, useGetCardQuery, useListCardsQuery } from "metabase/api";
import {
  canonicalCollectionId,
  isRootTrashCollection,
} from "metabase/collections/utils";
import Collections, {
  getCollectionType,
  normalizedCollection,
} from "metabase/entities/collections";
import { color } from "metabase/lib/colors";
import {
  createEntity,
  entityCompatibleQuery,
  undo,
} from "metabase/lib/entities";
import {
  API_UPDATE_QUESTION,
  SOFT_RELOAD_CARD,
} from "metabase/query_builder/actions/core/types";
import {
  getMetadata,
  getMetadataUnfiltered,
} from "metabase/selectors/metadata";

export const INJECT_RTK_QUERY_QUESTION_VALUE =
  "metabase/entities/questions/FETCH_ADHOC_METADATA";

/**
 * @deprecated use "metabase/api" instead
 */
const Questions = createEntity({
  name: "questions",
  nameOne: "question",
  path: "/api/card",

  rtk: {
    getUseGetQuery: () => ({
      useGetQuery: useGetCardQuery,
    }),
    useListQuery: useListCardsQuery,
  },

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

  objectActions: {
    setArchived: (card, archived, opts) =>
      Questions.actions.update(
        { id: card.id },
        { archived },
        undo(opts, getLabel(card), archived ? t`trashed` : t`restored`),
      ),

    // NOTE: standard questions (i.e. not models, metrics, etc.) can live in dashboards as well as collections.
    // this function name is incorrect but maintained for consistency with other entities.
    setCollection: (card, destination, opts) => {
      return async (dispatch) => {
        const archived =
          destination.model === "collection" &&
          isRootTrashCollection(destination);

        const update =
          destination.model === "dashboard"
            ? {
                dashboard_id: destination.id,
                archived,
                delete_old_dashcards: true,
              }
            : {
                collection_id: canonicalCollectionId(destination.id),
                dashboard_id: null,
                archived,
              };

        const result = await dispatch(
          Questions.actions.update(
            { id: card.id },
            update,
            undo(opts, getLabel(card), t`moved`),
          ),
        );

        dispatch(
          Collections.actions.fetchList(
            {
              tree: true,
              "exclude-archived": true,
            },
            { reload: true },
          ),
        );

        const updatedCard = result?.payload?.question;

        if (updatedCard) {
          dispatch({ type: API_UPDATE_QUESTION, payload: updatedCard });
        }

        return result;
      };
    },

    setPinned: ({ id }, pinned, opts) =>
      Questions.actions.update(
        { id },
        {
          collection_position:
            typeof pinned === "number" ? pinned : pinned ? 1 : null,
        },
        opts,
      ),

    setCollectionPreview: ({ id }, collection_preview, opts) =>
      Questions.actions.update({ id }, { collection_preview }, opts),
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

  objectSelectors: {
    getName: (card) => card && card.name,
    getColor: () => color("text-secondary"),
    getCollection: (card) => card && normalizedCollection(card.collection),
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

function getLabel(card) {
  if (card.type === "model" || card.model === "dataset") {
    return t`model`;
  }

  if (card.type === "metric" || card.model === "metric") {
    return t`metric`;
  }

  return t`question`;
}

export default Questions;
