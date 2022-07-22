import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import {
  API_UPDATE_QUESTION,
  SOFT_RELOAD_CARD,
} from "metabase/query_builder/actions";

import Collections, {
  getCollectionType,
  normalizedCollection,
} from "metabase/entities/collections";
import { canonicalCollectionId } from "metabase/collections/utils";

import forms from "./questions/forms";
import { updateIn } from "icepick";

const Questions = createEntity({
  name: "questions",
  nameOne: "question",
  path: "/api/card",

  objectActions: {
    setArchived: ({ id, model }, archived, opts) =>
      Questions.actions.update(
        { id },
        { archived },
        undo(
          opts,
          model === "dataset" ? "model" : "question",
          archived ? "archived" : "unarchived",
        ),
      ),

    setCollection: ({ id, model }, collection, opts) => {
      return async dispatch => {
        const result = await dispatch(
          Questions.actions.update(
            { id },
            {
              collection_id: canonicalCollectionId(collection && collection.id),
            },
            undo(opts, model === "dataset" ? "model" : "question", "moved"),
          ),
        );
        dispatch(
          Collections.actions.fetchList({ tree: true }, { reload: true }),
        );

        const card = result?.payload?.question;
        if (card) {
          dispatch.action(API_UPDATE_QUESTION, card);
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

  objectSelectors: {
    getName: question => question && question.name,
    getUrl: question => question && Urls.question(question),
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

function getIcon(question) {
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
