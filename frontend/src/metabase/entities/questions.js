/* @flow */

import { assocIn } from "icepick";

import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import {
  canonicalCollectionId,
  getCollectionType,
} from "metabase/entities/collections";

import { POST, PUT, DELETE } from "metabase/lib/api";

const FAVORITE_ACTION = `metabase/entities/questions/FAVORITE`;
const UNFAVORITE_ACTION = `metabase/entities/questions/UNFAVORITE`;

// The card creation/update endpoints return 200s with an error in the body.
const apiOptions = { bodyHasError: body => body.async_status === "error" };

const Questions = createEntity({
  name: "questions",
  path: "/api/card",

  api: {
    favorite: POST("/api/card/:id/favorite"),
    unfavorite: DELETE("/api/card/:id/favorite"),
    create: POST("/api/card", apiOptions),
    update: PUT("/api/card/:id", apiOptions),
  },

  objectActions: {
    setArchived: ({ id }, archived, opts) =>
      Questions.actions.update(
        { id },
        { archived },
        undo(opts, "question", archived ? "archived" : "unarchived"),
      ),

    setCollection: ({ id }, collection, opts) =>
      Questions.actions.update(
        { id },
        { collection_id: canonicalCollectionId(collection && collection.id) },
        undo(opts, "question", "moved"),
      ),

    setPinned: ({ id }, pinned, opts) =>
      Questions.actions.update(
        { id },
        {
          collection_position:
            typeof pinned === "number" ? pinned : pinned ? 1 : null,
        },
        opts,
      ),

    setFavorited: async ({ id }, favorite) => {
      if (favorite) {
        await Questions.api.favorite({ id });
        return { type: FAVORITE_ACTION, payload: id };
      } else {
        await Questions.api.unfavorite({ id });
        return { type: UNFAVORITE_ACTION, payload: id };
      }
    },
  },

  objectSelectors: {
    getName: question => question && question.name,
    getUrl: question => question && Urls.question(question.id),
    getColor: () => color("text-medium"),
    getIcon: question =>
      (require("metabase/visualizations").default.get(question.display) || {})
        .iconName || "beaker",
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === FAVORITE_ACTION && !error) {
      return assocIn(state, [payload, "favorite"], true);
    } else if (type === UNFAVORITE_ACTION && !error) {
      return assocIn(state, [payload, "favorite"], false);
    }
    return state;
  },

  form: {
    fields: [
      { name: "name" },
      { name: "description", type: "text" },
      {
        name: "collection_id",
        title: "Collection",
        type: "collection",
      },
    ],
  },

  // NOTE: keep in sync with src/metabase/api/card.clj
  writableProperties: [
    "name",
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
    "metadata_checksum",
  ],

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },
});

export default Questions;
