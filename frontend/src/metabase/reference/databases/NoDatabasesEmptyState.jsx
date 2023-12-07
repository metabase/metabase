import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";

export const NoDatabasesEmptyState = () => {
  const applicationName = useSelector(getApplicationName);
  return (
    // Screenshot 2023-12-04 at 11.35.00AM
    // Screenshot 2023-12-07 at 5.30.11PM
    <AdminAwareEmptyState
      title={t`${applicationName} is no fun without any data`}
      adminMessage={t`Your databases will appear here once you connect one`}
      message={t`Databases will appear here once your admins have added some`}
      image="app/assets/img/databases-list"
      adminAction={t`Connect a database`}
      adminLink="/admin/databases/create"
    />
  );
};
