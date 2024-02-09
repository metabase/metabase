import { t } from "ttag";
import { updateIn } from "icepick";

import { isCypressActive, isProduction, isTest } from "metabase/env";
import { GET, POST, PUT } from "metabase/lib/api";
import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";
import {
  getMetadata,
  getMetadataUnfiltered,
} from "metabase/selectors/metadata";

import Collections, {
  getCollectionType,
  normalizedCollection,
} from "metabase/entities/collections";
import {
  API_UPDATE_QUESTION,
  SOFT_RELOAD_CARD,
} from "metabase/query_builder/actions";

import { canonicalCollectionId } from "metabase/collections/utils";
import forms from "./questions/forms";

const Questions = createEntity({
  name: "questions",
  nameOne: "question",
  path: "/api/card",

  ...(isTest || isCypressActive || isProduction
    ? {}
    : {
        /**
         * Temporarily mock endpoints for Metrics v2
         *
         * Any question with `type: "metric"` will be passed to API as `type: "question"`.
         * Same goes for any questions with a name starting with "Metric" (case-insensitive).
         */
        api: {
          get: async payload => {
            const get = GET("/api/card/:id");
            const result = await get(payload);

            if (result.name.toLowerCase().includes("metric")) {
              return { ...result, type: "metric", dataset: false };
            }

            return result;
          },

          list: async payload => {
            const get = GET("/api/card");
            const results = await get(payload);

            return results.map(result => {
              if (result.name.toLowerCase().includes("metric")) {
                return { ...result, type: "metric", dataset: false };
              }

              return result;
            });
          },

          create: async payload => {
            const create = POST("/api/card");

            if (payload.type === "metric") {
              const tweakedPayload = {
                ...payload,
                type: "question",
                dataset: false,
              };
              const result = await create(tweakedPayload);
              return { ...result, type: "metric" };
            }

            return await create(payload);
          },

          update: async payload => {
            const update = PUT("/api/card/:id");

            if (payload.type === "metric") {
              const tweakedPayload = {
                ...payload,
                type: "question",
                dataset: false,
              };
              const result = await update(tweakedPayload);
              return { ...result, type: "metric" };
            }

            return await update(payload);
          },
        },
      }),

  objectActions: {
    setArchived: ({ id, dataset, model }, archived, opts) =>
      Questions.actions.update(
        { id },
        { archived },
        undo(
          opts,
          dataset || model === "dataset" ? t`model` : t`question`,
          archived ? t`archived` : t`unarchived`,
        ),
      ),

    setCollection: ({ id, dataset, model }, collection, opts) => {
      return async dispatch => {
        const result = await dispatch(
          Questions.actions.update(
            { id },
            {
              collection_id: canonicalCollectionId(collection && collection.id),
            },
            undo(
              opts,
              dataset || model === "dataset" ? t`model` : t`question`,
              t`moved`,
            ),
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

        const card = result?.payload?.question;
        if (card) {
          dispatch({ type: API_UPDATE_QUESTION, payload: card });
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
    getName: question => question && question.name,
    getUrl: (question, opts) => question && Urls.question(question, opts),
    getColor: () => color("text-medium"),
    getCollection: question =>
      question && normalizedCollection(question.collection),
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
    "dataset",
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
    "collection_position",
    "collection_preview",
    "result_metadata",
  ],

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },

  forms,
});

export function getIcon(question) {
  if (question.dataset || question.model === "dataset") {
    return { name: "model" };
  }
  const visualization = require("metabase/visualizations").default.get(
    question.display,
  );
  return {
    name: visualization?.iconName ?? "beaker",
  };
}

export default Questions;
