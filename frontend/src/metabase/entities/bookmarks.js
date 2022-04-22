import { dissoc } from "icepick";

import { createEntity } from "metabase/lib/entities";
import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";
import { BookmarkSchema } from "metabase/schema";
import { BookmarkApi } from "metabase/services";

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
  selectors: {
    getOrderedList: ({ entities }, { entityQuery }) => {
      const ids = entities.bookmarks_list?.null?.list || [];
      return ids.map(id => entities.bookmarks[id]);
    },
  },
  objectSelectors: {
    getIcon,
  },
  actions: {
    reorder: (bookmarks, oldIndex, newIndex) => async dispatch => {
      console.log("🚀", { bookmarks, oldIndex, newIndex });
      // dispatch({ type: Dashboards.actionTypes.INVALIDATE_LISTS_ACTION });
      const element = bookmarks[oldIndex];

      bookmarks.splice(oldIndex, 1);
      bookmarks.splice(newIndex, 0, element);

      dispatch({ type: "bookmarks/REORDER", bookmarks });

      const bookmarksWithFieldsForWebservice = bookmarks.map(
        ({ type, item_id }) => ({
          type,
          item_id,
        }),
      );
      BookmarkApi.reorder(
        { orderings: { orderings: bookmarksWithFieldsForWebservice } },
        { bodyParamName: "orderings" },
      );
    },
  },
  reducer: (state = {}, { type, payload, error, bookmarks }) => {
    if (type === Questions.actionTypes.UPDATE && payload?.object?.archived) {
      const key = "card-" + payload?.object?.id;
      return dissoc(state, key);
    }

    if (type === Dashboards.actionTypes.UPDATE && payload?.object?.archived) {
      const key = "dashboard-" + payload?.object?.id;
      return dissoc(state, key);
    }

    // if (type === "metabase/qb/API_UPDATE_QUESTION") {
    //   const { id, query_type } = payload;
    //   const entityType = query_type === "query" ? "card" : query_type;

    //   const key = entityType + "-" + id;
    //   return assocIn(state, [key, "name"], payload.name);
    // }

    if (type === "bookmarks/REORDER") {
      console.log("🚀", { bookmarks });
      return bookmarks;
      // return { ...state };
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

export default Bookmarks;
