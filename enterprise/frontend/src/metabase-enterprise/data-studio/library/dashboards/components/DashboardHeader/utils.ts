import type { CollectionEssentials } from "metabase-types/api";

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
