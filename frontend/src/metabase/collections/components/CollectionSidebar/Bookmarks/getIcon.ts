import Collection from "metabase/entities/collections";
import Dashboard from "metabase/entities/dashboards";
import Question from "metabase/entities/questions";
import { Bookmark } from "metabase-types/api";
import { color } from "metabase/lib/colors";

export function getIcon(bookmark: Bookmark) {
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
