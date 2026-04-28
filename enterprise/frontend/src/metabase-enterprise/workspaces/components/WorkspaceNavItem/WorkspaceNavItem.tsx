import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import * as Urls from "metabase/utils/urls";

export function WorkspaceNavItem() {
  const location = useSelector(getLocation);
  const path = Urls.adminWorkspaceList();

  return (
    <AdminNavItem
      label={t`Workspaces`}
      icon="folder"
      path={path}
      active={location?.pathname.startsWith(path) ?? false}
    />
  );
}
