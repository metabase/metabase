import { createEntity } from "metabase/lib/entities";
import Collection from "metabase/entities/collections";
import Dashboard from "metabase/entities/dashboards";
import Question from "metabase/entities/questions";
import { BookmarkSchema } from "metabase/schema";
import { BookmarkApi } from "metabase/services";
import { color } from "metabase/lib/colors";

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

export function getIcon(bookmark) {
  const { type } = bookmark;

  const { color: iconColor, name, tooltip } =
    type === "card"
      ? Question.objectSelectors.getIcon(bookmark)
      : type === "collection"
      ? Collection.objectSelectors.getIcon(bookmark)
      : Dashboard.objectSelectors.getIcon(bookmark);

  const treatedColor = type === "card" ? color("brand") : iconColor;
  const opacity = tooltip ? 1 : 0.5;

  return { name, color: treatedColor, opacity };
}

export default Bookmarks;
