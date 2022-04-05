import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import Collections, {
  getCollectionType,
  normalizedCollection,
} from "metabase/entities/collections";
import { canonicalCollectionId } from "metabase/collections/utils";

import forms from "./questions/forms";

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
    "archived",
    "enable_embedding",
    "embedding_params",
    "collection_id",
    "collection_position",
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
