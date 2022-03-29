import { createEntity } from "metabase/lib/entities";
import Collection from "metabase/entities/collections";
import Dashboard from "metabase/entities/dashboards";
import Question from "metabase/entities/questions";
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
});

function getEntityFor(type) {
  const entities = {
    card: Question,
    collection: Collection,
    dashboard: Dashboard,
  };

  return entities[type];
}

export function getIcon(bookmark) {
  const bookmarkEntity = getEntityFor(bookmark.type);
  return bookmarkEntity.objectSelectors.getIcon(bookmark);
}

export default Bookmarks;
