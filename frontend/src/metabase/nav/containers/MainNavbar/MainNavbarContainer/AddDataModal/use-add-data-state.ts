import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import { type AttachedDwhInfo, getHasAttachedDwh } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { canAccessSettings, getUserIsAdmin } from "metabase/selectors/user";

interface AddDataState extends AttachedDwhInfo {
  areDatabasesLoading: boolean;
  areUploadsEnabled: boolean;
  canUploadToDatabase: boolean;
  canManageUploads: boolean;
  isAdmin: boolean;
}

/**
 * The upload facts the Add data modal derives from, in one place so the tabs,
 * the header links and the CSV panel cannot disagree about them.
 *
 * They come from the databases list rather than the `uploads-settings` setting,
 * which only updates when session properties are refetched and so goes stale as
 * soon as the upload target changes.
 */
export function useAddDataState(): AddDataState {
  const { data: databasesResponse, isLoading: areDatabasesLoading } =
    useListDatabasesQuery();
  const canManageUploads = useSelector(canAccessSettings);
  const isAdmin = useSelector(getUserIsAdmin);

  const databases = databasesResponse?.data;

  // Mounted on every page through `useCanAddData` and re-run on every poll tick
  // while storage provisions, so keep the scans off the render path.
  return useMemo(
    () => ({
      areDatabasesLoading,
      areUploadsEnabled: !!databases?.some((db) => db.uploads_enabled),
      canUploadToDatabase: !!databases?.some((db) => db.can_upload),
      hasAttachedDwh: getHasAttachedDwh(databases),
      canManageUploads,
      isAdmin,
    }),
    [databases, areDatabasesLoading, canManageUploads, isAdmin],
  );
}
