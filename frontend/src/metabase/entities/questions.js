/* @flow */

import React from "react";

import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { assocIn } from "icepick";

import CollectionSelect from "metabase/containers/CollectionSelect";

import { POST, DELETE } from "metabase/lib/api";

const FAVORITE_ACTION = `metabase/entities/questions/FAVORITE`;
const UNFAVORITE_ACTION = `metabase/entities/questions/UNFAVORITE`;

const Questions = createEntity({
  name: "questions",
  path: "/api/card",

  api: {
    favorite: POST("/api/card/:id/favorite"),
    unfavorite: DELETE("/api/card/:id/favorite"),
  },

  objectActions: {
    setArchived: ({ id }, archived) =>
      Questions.actions.update({ id, archived }),
    setCollection: ({ id }, collection) =>
      Questions.actions.update({
        id,
        collection_id: collection && collection.id,
      }),
    setPinned: ({ id }, pinned) =>
      Questions.actions.update({ id, collection_position: pinned ? 1 : null }),
    setFavorited: async ({ id }, favorited) => {
      if (favorited) {
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
    getColor: () => "#93B3C9",
    getIcon: question => "beaker",
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === FAVORITE_ACTION && !error) {
      return assocIn(state, [payload, "favorited"], true);
    } else if (type === UNFAVORITE_ACTION && !error) {
      return assocIn(state, [payload, "favorited"], false);
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
        type: ({ field }) => <CollectionSelect {...field} />,
      },
    ],
  },
});

export default Questions;
