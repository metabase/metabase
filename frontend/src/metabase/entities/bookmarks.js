import { createSelector } from "@reduxjs/toolkit";
import { assoc, dissoc, getIn, updateIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { bookmarkApi, useListBookmarksQuery } from "metabase/api";
import { Collections } from "metabase/entities/collections";
import { Dashboards } from "metabase/entities/dashboards";
import { Documents } from "metabase/entities/documents";
import { Questions } from "metabase/entities/questions";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";
import { addUndo } from "metabase/redux/undo";
import { BookmarkSchema } from "metabase/schema";

const REORDER_ACTION = `metabase/entities/bookmarks/REORDER_ACTION`;

/**
 * @deprecated use "metabase/api" instead
 */
export const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  schema: BookmarkSchema,
  rtk: {
    useListQuery: useListBookmarksQuery,
  },
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
    reorder: (bookmarks) => async (dispatch, getState) => {
      const bookmarksBeforeReordering = getOrderedBookmarks(getState());
      const orderings = bookmarks.map(({ type, item_id }) => ({
        type,
        item_id,
      }));
      dispatch({ type: REORDER_ACTION, payload: bookmarks });
      try {
        await entityCompatibleQuery(
          { orderings },
          dispatch,
          bookmarkApi.endpoints.reorderBookmarks,
        );
      } catch (e) {
        dispatch({ type: REORDER_ACTION, payload: bookmarksBeforeReordering });
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: t`Something went wrong`,
          }),
        );
      }
    },
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === Questions.actionTypes.UPDATE && payload?.object) {
      const { archived, type, id, name } = payload.object;
      const key = `card-${id}`;
      if (!getIn(state, [key])) {
        return state;
      }
      if (archived) {
        return dissoc(state, key);
      } else {
        return updateIn(state, [key], (item) => ({
          ...item,
          card_type: type,
          name,
        }));
      }
    }

    if (type === Dashboards.actionTypes.UPDATE && payload?.object) {
      const { archived, id, name } = payload.object;
      const key = `dashboard-${id}`;
      if (!getIn(state, [key])) {
        return state;
      }
      if (archived) {
        return dissoc(state, key);
      } else {
        return updateIn(state, [key], (item) => ({ ...item, name }));
      }
    }

    if (type === Collections.actionTypes.UPDATE && payload?.object) {
      const { id, authority_level, name } = payload.object;
      const key = `collection-${id}`;

      if (!getIn(state, [key])) {
        return state;
      }
      if (payload.object.archived) {
        return dissoc(state, key);
      } else {
        return updateIn(state, [key], (item) => ({
          ...item,
          authority_level,
          name,
        }));
      }
    }

    if (type === Documents.actionTypes.UPDATE && payload?.object) {
      const { id, archived, name } = payload.object;
      const key = `document-${id}`;

      if (!getIn(state, [key])) {
        return state;
      }
      if (archived) {
        return dissoc(state, key);
      } else {
        return updateIn(state, [key], (item) => ({ ...item, name }));
      }
    }

    if (type === Bookmarks.actionTypes.REORDER) {
      const indexes = payload.reduce((indexes, bookmark, index) => {
        indexes[bookmark.id] = index;
        return indexes;
      }, {});

      return _.mapObject(state, (bookmark) =>
        assoc(bookmark, "index", indexes[bookmark.id]),
      );
    }

    return state;
  },
});

export const getOrderedBookmarks = createSelector(
  [Bookmarks.selectors.getList],
  (bookmarks) => _.sortBy(bookmarks, (bookmark) => bookmark.index),
);
