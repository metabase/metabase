import { updateIn } from "icepick";
import { t } from "ttag";

import { canonicalCollectionId } from "metabase/collections/utils";
import Collections, {
  getCollectionType,
  normalizedCollection,
} from "metabase/entities/collections";
import { color } from "metabase/lib/colors";
import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_MODERATION } from "metabase/plugins";
import {
  API_UPDATE_QUESTION,
  SOFT_RELOAD_CARD,
} from "metabase/query_builder/actions";
import {
  getMetadata,
  getMetadataUnfiltered,
} from "metabase/selectors/metadata";

import forms from "./questions/forms";

const Questions = createEntity({
  name: "questions",
  nameOne: "question",
  path: "/api/card",

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
  const type = PLUGIN_MODERATION.getQuestionIcon(question);

  if (type) {
    return {
      name: type.icon,
      color: type.color ? color(type.color) : undefined,
      tooltip: type.tooltip,
    };
  }

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
