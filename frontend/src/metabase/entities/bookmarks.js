import { assoc, dissoc } from "icepick";
import _ from "underscore";
import { createEntity } from "metabase/lib/entities";
import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";
import { BookmarkSchema } from "metabase/schema";
import { BookmarkApi } from "metabase/services";

const REORDER_ACTION = `metabase/entities/entities/REORDER_ACTION`;

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
    REORDER_ACTION,
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
    if (type === Questions.actionTypes.UPDATE && payload?.object?.archived) {
      const key = "card-" + payload?.object?.id;
      return dissoc(state, key);
    }

    if (type === Dashboards.actionTypes.UPDATE && payload?.object?.archived) {
      const key = "dashboard-" + payload?.object?.id;
      return dissoc(state, key);
    }

    if (type === Bookmarks.actionTypes.REORDER) {
      let order = 0;
      return _.mapObject(state, bookmark => assoc(bookmark, "order", order++));
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
