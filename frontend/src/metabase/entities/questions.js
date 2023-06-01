import { t } from "ttag";
import { updateIn } from "icepick";

import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { GET } from "metabase/lib/api";
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
  // FIXME temp mock code
  api: {
    get: async (...params) => {
      const card = await GET(`/api/card/:id`)(params[0]);

      if (
        ["Audit", "Performance", "Usage", "Instance analytics"].includes(
          card?.collection?.name,
        )
      ) {
        card.collection.type = "instance-analytics";
        card.can_write = false;
      }
      return card;
    },
  },

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
