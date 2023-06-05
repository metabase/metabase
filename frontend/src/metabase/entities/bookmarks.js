import { assoc, updateIn, dissoc } from "icepick";
import _ from "underscore";
import { createSelector } from "@reduxjs/toolkit";
import { createEntity } from "metabase/lib/entities";
import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";
import { BookmarkSchema } from "metabase/schema";
import { BookmarkApi } from "metabase/services";

const REORDER_ACTION = `metabase/entities/bookmarks/REORDER_ACTION`;

const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  schema: BookmarkSchema,
  api: {
    create: async params => {
      const { id, type } = params;
      return BookmarkApi[type].create({ id });
    },
    delete: async params => {
      const { id, type } = params;
      return BookmarkApi[type].delete({ id });
    },
  },
  actionTypes: {
    REORDER: REORDER_ACTION,
  },
  actions: {
    reorder: bookmarks => {
      const orderings = bookmarks.map(({ type, item_id }) => ({
        type,
        item_id,
      }));
      BookmarkApi.reorder(
        { orderings: { orderings } },
        { bodyParamName: "orderings" },
      );

      return { type: REORDER_ACTION, payload: bookmarks };
    },
  },
  objectSelectors: {
    getIcon,
  },
  reducer: (state = {}, { type, payload, error }) => {
    if (type === Questions.actionTypes.UPDATE && payload?.object) {
      const { archived, dataset, id, name } = payload.object;
      const key = `card-${id}`;
      if (archived) {
        return dissoc(state, key);
      } else {
        return updateIn(state, [key], item => ({ ...item, dataset, name }));
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
  return bookmarkEntity.objectSelectors.getIcon(bookmark);
}

export const getOrderedBookmarks = createSelector(
  [Bookmarks.selectors.getList],
  bookmarks => _.sortBy(bookmarks, bookmark => bookmark.index),
);

export default Bookmarks;
