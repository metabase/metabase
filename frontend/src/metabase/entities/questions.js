/* @flow */

import React from "react";

import { createEntity, undo } from "metabase/lib/entities";
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
    setArchived: ({ id }, archived, opts) =>
      Questions.actions.update(
        { id },
        { archived },
        undo(opts, "question", archived ? "archived" : "unarchived"),
      ),

    setCollection: ({ id }, collection, opts) =>
      Questions.actions.update(
        { id },
        // TODO - would be dope to make this check in one spot instead of on every movable item type
        {
          collection_id:
            !collection || collection.id === "root" ? null : collection.id,
        },
        undo(opts, "question", "moved"),
      ),

    setPinned: ({ id }, pinned, opts) =>
      Questions.actions.update(
        { id },
        { collection_position: pinned ? 1 : null },
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
    getColor: () => "#93B3C9",
    getIcon: question => "beaker",
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
        // eslint-disable-next-line react/display-name
        type: ({ field }) => <CollectionSelect {...field} />,
      },
    ],
  },
});

export default Questions;
