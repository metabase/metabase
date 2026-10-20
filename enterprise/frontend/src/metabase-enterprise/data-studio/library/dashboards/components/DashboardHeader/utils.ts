import type { CollectionEssentials } from "metabase-types/api";

export function getDashboardFolders(
  path: CollectionEssentials[],
): CollectionEssentials[] {
  const sectionIndex = path.findIndex(
    (collection) => collection.type === "library-dashboards",
  );
  return sectionIndex === -1 ? [] : path.slice(sectionIndex + 1);
}
