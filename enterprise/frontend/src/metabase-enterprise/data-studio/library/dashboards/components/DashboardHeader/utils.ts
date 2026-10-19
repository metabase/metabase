import type { CollectionEssentials } from "metabase-types/api";

/**
 * Where a dashboard sits: under the Library's Dashboards section, in which
 * case `folders` are the collections below that section, or in any other
 * collection, in which case `path` is the collection and its ancestors.
 */
export type DashboardLocation =
  | { type: "library"; folders: CollectionEssentials[] }
  | { type: "collection"; path: CollectionEssentials[] };

export function getDashboardLocation(
  path: CollectionEssentials[],
): DashboardLocation {
  const sectionIndex = path.findIndex(
    (collection) => collection.type === "library-dashboards",
  );
  return sectionIndex === -1
    ? { type: "collection", path }
    : { type: "library", folders: path.slice(sectionIndex + 1) };
}
