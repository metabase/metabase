import { Bookmark } from "metabase-types/api";

export function getIcon({ authority_level, display, type }: Bookmark) {
  if (display) {
    return display;
  }

  if (type === "collection") {
    return authority_level === "official" ? "badge" : "folder";
  }

  const icons = {
    card: "grid",
    dashboard: "dashboard",
  };

  return icons[type];
}
