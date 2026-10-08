import { t } from "ttag";

import databasesListImage from "assets/img/databases-list.png";
import databasesListImage2x from "assets/img/databases-list@2x.png";
import { AdminAwareEmptyState } from "metabase/common/components/AdminAwareEmptyState";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";

export const NoDatabasesEmptyState = () => {
  const applicationName = useSelector(getApplicationName);
  return (
    <AdminAwareEmptyState
      title={t`${applicationName} is no fun without any data`}
      adminMessage={t`Your databases will appear here once you connect one`}
      message={t`Databases will appear here once your admins have added some`}
      image={{
        src: databasesListImage,
        srcSet: `${databasesListImage2x} 2x`,
      }}
      adminAction={t`Connect a database`}
      adminLink="/admin/databases/create"
    />
  );
};
