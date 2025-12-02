import { useListDatabasesQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { canAccessSettings, getUserIsAdmin } from "metabase/selectors/user";

export function useAddDataPermissions() {
  const { data: databasesResponse } = useListDatabasesQuery();
  const userCanAccessSettings = useSelector(canAccessSettings);
  const isAdmin = useSelector(getUserIsAdmin);
  const databases = databasesResponse?.data;
  const uploadDbId = useSetting("uploads-settings")?.db_id;
  const uploadDB = databases?.find((db) => db.id === uploadDbId);

  /**
   * This covers the case where instance has the attached dwh. In such cases
   * uploads are enabled by default.
   */
  const areUploadsEnabled = !!uploadDbId;
  const canUploadToDatabase = !!uploadDB?.can_upload;
  const canManageUploads = userCanAccessSettings;
  const canPerformMeaningfulActions =
    canUploadToDatabase || canManageUploads || isAdmin;

  return {
    areUploadsEnabled,
    canUploadToDatabase,
    canManageUploads,
    canPerformMeaningfulActions,
    isAdmin,
  };
}
