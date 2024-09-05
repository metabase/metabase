import { updateIn } from "icepick";
import { t } from "ttag";

import { cardApi, datasetApi } from "metabase/api";
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
import { compose, withAction, withNormalize } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_MODERATION } from "metabase/plugins";
import {
  API_UPDATE_QUESTION,
  SOFT_RELOAD_CARD,
} from "metabase/query_builder/actions/core/types";
import { DatabaseSchema, FieldSchema, TableSchema } from "metabase/schema";
import {
  getMetadata,
  getMetadataUnfiltered,
} from "metabase/selectors/metadata";

const FETCH_METADATA = "metabase/entities/questions/FETCH_METADATA";
const FETCH_ADHOC_METADATA = "metabase/entities/questions/FETCH_ADHOC_METADATA";

/**
 * @deprecated use "metabase/api" instead
 */
const Questions = createEntity({
  name: "questions",
  nameOne: "question",
  path: "/api/card",

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(entityQuery, dispatch, cardApi.endpoints.listCards),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        { ...entityQuery, ignore_error: options?.noEvent },
        dispatch,
        cardApi.endpoints.getCard,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        cardApi.endpoints.createCard,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        cardApi.endpoints.updateCard,
      ),
    delete: ({ id }, dispatch) =>
      entityCompatibleQuery(id, dispatch, cardApi.endpoints.deleteCard),
  },

  actions: {
    fetchMetadata: compose(
      withAction(FETCH_METADATA),
      withNormalize({
        databases: [DatabaseSchema],
        tables: [TableSchema],
        fields: [FieldSchema],
      }),
    )(
      ({ id } = {}) =>
        dispatch =>
          entityCompatibleQuery(
            id,
            dispatch,
            cardApi.endpoints.getCardQueryMetadata,
            { forceRefetch: false },
          ),
    ),
    fetchAdhocMetadata: compose(
      withAction(FETCH_ADHOC_METADATA),
      withNormalize({
        databases: [DatabaseSchema],
        tables: [TableSchema],
        fields: [FieldSchema],
      }),
    )(
      query => dispatch =>
        entityCompatibleQuery(
          query,
          dispatch,
          datasetApi.endpoints.getAdhocQueryMetadata,
          { forceRefetch: false },
        ),
    ),
  },

  objectActions: {
    setArchived: (card, archived, opts) =>
      Questions.actions.update(
        { id: card.id },
        { archived },
        undo(opts, getLabel(card), archived ? t`trashed` : t`restored`),
      ),

    setCollection: (card, collection, opts) => {
      return async dispatch => {
        const result = await dispatch(
          Questions.actions.update(
            { id: card.id },
            {
              collection_id: canonicalCollectionId(collection && collection.id),
              archived: isRootTrashCollection(collection),
            },
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
      return entityIds.map(entityId =>
        Questions.selectors.getObjectUnfiltered(state, { entityId }),
      );
    },
  },

  objectSelectors: {
    getName: card => card && card.name,
    getUrl: (card, opts) => card && Urls.question(card, opts),
    getColor: () => color("text-medium"),
    getCollection: card => card && normalizedCollection(card.collection),
    getIcon,
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === SOFT_RELOAD_CARD) {
      const { id } = payload;
      const latestReview = payload.moderation_reviews?.find(x => x.most_recent);

      if (latestReview) {
        return updateIn(state, [id], question => ({
          ...question,
          moderated_status: latestReview.status,
        }));
      }
    }
    return state;
  },

  // NOTE: keep in sync with src/metabase/api/card.clj
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
    "dashboard_id", // TODO: make sure it is in sync with src/metabase/api/card.clj
    "collection_position",
    "collection_preview",
    "result_metadata",
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

export function getIcon(card) {
  const type = PLUGIN_MODERATION.getQuestionIcon(card);

  if (type) {
    return {
      name: type.icon,
      color: type.color ? color(type.color) : undefined,
      tooltip: type.tooltip,
    };
  }

  if (card.type === "model" || card.model === "dataset") {
    return { name: "model" };
  }

  if (card.type === "metric" || card.model === "metric") {
    return { name: "metric" };
  }

  const visualization = require("metabase/visualizations").default.get(
    card.display,
  );
  return {
    name: visualization?.iconName ?? "beaker",
  };
}

export default Questions;
