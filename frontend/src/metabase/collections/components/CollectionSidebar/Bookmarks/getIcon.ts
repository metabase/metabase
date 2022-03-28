import { BookmarkableEntities } from "metabase-types/api";

export function getIcon(
  display: string | undefined,
  type: BookmarkableEntities,
) {
  if (display) {
    return display;
  }

  const icons = {
    card: "grid",
    collection: "folder",
    dashboard: "dashboard",
  };

  return icons[type];
}
