import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import type { Database } from "metabase-types/api";

export interface AttachedDwhInfo {
  /** Storage exists on this instance. */
  hasAttachedDwh: boolean;
}

export interface AttachedDwhState extends AttachedDwhInfo {
  /** While true, the flag above reads `false` because nothing was fetched yet. */
  areDatabasesLoading: boolean;
}

export const getHasAttachedDwh = (databases: Database[] | undefined) =>
  !!databases?.some((db) => db.is_attached_dwh);

/**
 * Whether this instance has Metabase Storage, derived from the databases list.
 *
 * Deliberately ungated on admin/hosted: non-admins such as settings managers
 * also need the answer, and the databases list is already fetched on every page.
 */
export function useAttachedDwh(): AttachedDwhState {
  const { data: databasesResponse, isLoading: areDatabasesLoading } =
    useListDatabasesQuery();
  const databases = databasesResponse?.data;

  // Mounted in always-present spots and re-run on every poll tick while storage
  // provisions, so keep the scan off the render path (as `useAddDataState` does).
  return useMemo(
    () => ({
      hasAttachedDwh: getHasAttachedDwh(databases),
      areDatabasesLoading,
    }),
    [databases, areDatabasesLoading],
  );
}
