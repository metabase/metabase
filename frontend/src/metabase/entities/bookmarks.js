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
  objectSelectors: {
    getIcon,
  },
  actions: {
    reorder: bookmarks => {
      const bookmarksForOrdering = bookmarks.map(({ type, item_id }) => ({
        type,
        item_id,
      }));
      BookmarkApi.reorder(
        { orderings: { orderings: bookmarksForOrdering } },
        { bodyParamName: "orderings" },
      );
    },
  },
  reducer: (state = {}, { type, payload, error }) => {
    if (type === Questions.actionTypes.UPDATE && payload?.object?.archived) {
      state[`card-${payload?.object?.id}`] = undefined;
      return state;
    }

    if (type === Dashboards.actionTypes.UPDATE && payload?.object?.archived) {
      state[`dashboard-${payload?.object?.id}`] = undefined;
      return state;
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
