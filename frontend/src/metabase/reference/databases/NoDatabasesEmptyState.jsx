import { t } from "ttag";

import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";

export const NoDatabasesEmptyState = () => {
  const applicationName = useSelector(getApplicationName);
  return (
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
