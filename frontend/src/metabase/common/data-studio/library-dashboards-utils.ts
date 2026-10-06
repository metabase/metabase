/**
 * PROTOTYPE: dashboards in the Library. Dependency-free helpers, see
 * `./library-dashboards` for details.
 */
import type { Collection } from "metabase-types/api";

export const LIBRARY_DASHBOARDS_DESCRIPTION =
  "Dashboards curated in the Library.";

export const LIBRARY_DASHBOARDS_TYPE = "library-dashboards" as const;

type MaybeLibraryDashboardsCollection = Partial<
  Pick<Collection, "description" | "location" | "archived" | "namespace">
> & { model?: string; personal_owner_id?: number | null };

export function isLibraryDashboardsCollection(
  collection: MaybeLibraryDashboardsCollection | null | undefined,
): boolean {
  return (
    collection != null &&
    (collection.model == null || collection.model === "collection") &&
    collection.description === LIBRARY_DASHBOARDS_DESCRIPTION &&
    (collection.location == null || collection.location === "/") &&
    !collection.archived &&
    collection.personal_owner_id == null &&
    (collection.namespace == null || collection.namespace === "analytics")
  );
}
