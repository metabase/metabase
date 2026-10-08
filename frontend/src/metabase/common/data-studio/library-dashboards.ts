/**
 * PROTOTYPE: helpers for dashboards in the Library › Dashboards collection
 * (type `library-dashboards`) and its subfolders.
 */
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { Collection } from "metabase-types/api";

import { canAccessDataStudio } from "./selectors";

type MaybeCollection =
  | Partial<Pick<Collection, "type" | "is_library_root">>
  | null
  | undefined;

/** The Library › Dashboards collection itself */
export function isLibraryDashboardsRoot(collection: MaybeCollection): boolean {
  return (
    collection?.type === "library-dashboards" && !!collection.is_library_root
  );
}

/** Library › Dashboards or one of its subfolders, which share its type */
export function isInLibraryDashboards(collection: MaybeCollection): boolean {
  return collection?.type === "library-dashboards";
}

/** Admins and Data Analysts manage Library dashboards from Data Studio. */
export function useCanUseLibraryDashboards() {
  const canAccess = useSelector(canAccessDataStudio);
  return PLUGIN_LIBRARY.isEnabled && canAccess;
}
