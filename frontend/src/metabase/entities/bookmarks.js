import { createSelector } from "@reduxjs/toolkit";
import { assoc, updateIn, dissoc } from "icepick";
import _ from "underscore";

import { bookmarkApi } from "metabase/api";
import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";
import { BookmarkSchema } from "metabase/schema";

const REORDER_ACTION = `metabase/entities/bookmarks/REORDER_ACTION`;

/**
 * @deprecated use "metabase/api" instead
 */
const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  schema: BookmarkSchema,
  api: {
    list: (_, dispatch) => {
      return entityCompatibleQuery(
        {},
        dispatch,
        bookmarkApi.endpoints.listBookmarks,
      );
    },
    create: (params, dispatch) => {
      return entityCompatibleQuery(
        params,
        dispatch,
        bookmarkApi.endpoints.createBookmark,
      );
    },
    delete: (params, dispatch) => {
      return entityCompatibleQuery(
        params,
        dispatch,
        bookmarkApi.endpoints.deleteBookmark,
      );
    },
  },
  actionTypes: {
    REORDER: REORDER_ACTION,
  },
  actions: {
    reorder: bookmarks => async dispatch => {
      const orderings = bookmarks.map(({ type, item_id }) => ({
        type,
        item_id,
      }));
      await entityCompatibleQuery(
        { orderings },
        dispatch,
        bookmarkApi.endpoints.reorderBookmarks,
      );
      return { type: REORDER_ACTION, payload: bookmarks };
    },
  },
  objectSelectors: {
    getIcon,
  },
  reducer: (state = {}, { type, payload, error }) => {
    if (type === Questions.actionTypes.UPDATE && payload?.object) {
      const { archived, type, id, name } = payload.object;
      const key = `card-${id}`;
      if (archived) {
        return dissoc(state, key);
      } else {
        return updateIn(state, [key], item => ({
          ...item,
          card_type: type,
          name,
        }));
      }
    }

    if (type === Dashboards.actionTypes.UPDATE && payload?.object) {
      const { archived, id, name } = payload.object;
      const key = `dashboard-${id}`;
      if (archived) {
        return dissoc(state, key);
      } else {
        return updateIn(state, [key], item => ({ ...item, name }));
      }
    }

    if (type === Collections.actionTypes.UPDATE && payload?.object) {
      const { id, authority_level, name } = payload.object;
      const key = `collection-${id}`;

      if (payload.object.archived) {
        return dissoc(state, key);
      } else {
        return updateIn(state, [key], item => ({
          ...item,
          authority_level,
          name,
        }));
      }
    }

    if (type === Bookmarks.actionTypes.REORDER) {
      const indexes = payload.reduce((indexes, bookmark, index) => {
        indexes[bookmark.id] = index;
        return indexes;
      }, {});

      return _.mapObject(state, bookmark =>
        assoc(bookmark, "index", indexes[bookmark.id]),
      );
    }

    return state;
  },
});

function getEntityFor(type) {
  const entities = {
    card: Questions,
    collection: Collections,
    dashboard: Dashboards,
  };

  return entities[type];
}

function getIcon(bookmark) {
  const bookmarkEntity = getEntityFor(bookmark.type);

  if (bookmarkEntity.name === "questions") {
    return bookmarkEntity.objectSelectors.getIcon({
      ...bookmark,
      /**
       * Questions.objectSelectors.getIcon works with Card instances.
       * In order to reuse it we need to map Bookmark["card_type"] to Card["type"]
       * because Bookmark["type"] is something else.
       */
      type: bookmark.type === "card" ? bookmark.card_type : bookmark.type,
    });
  }

  return bookmarkEntity.objectSelectors.getIcon(bookmark);
}

export function isModelBookmark(bookmark) {
  return bookmark.type === "card" && bookmark.card_type === "model";
}

export const getOrderedBookmarks = createSelector(
  [Bookmarks.selectors.getList],
  bookmarks => _.sortBy(bookmarks, bookmark => bookmark.index),
);

export default Bookmarks;
