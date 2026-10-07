import { t } from "ttag";

import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { canAccessDataModel } from "metabase/current-user";
import { PLUGIN_SCHEMA_VIEWER } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { canManageDatabases } from "metabase/selectors/admin";
import * as Urls from "metabase/urls";
import type { DatabaseId, IconName } from "metabase-types/api";

type DatabaseQuickLink = {
  key: string;
  label: string;
  icon: IconName;
  to: string;
  isVisible: boolean;
};

export function useDatabaseQuickLinks(
  databaseId: DatabaseId,
): DatabaseQuickLink[] {
  const hasDatabaseManagementAccess = useSelector(canManageDatabases);
  const hasDataModelAccess = useSelector(canAccessDataModel);
  const hasDataStudioAccess = useSelector(canAccessDataStudio);

  const links: DatabaseQuickLink[] = [
    {
      key: "manage",
      label: t`Manage database`,
      icon: "gear",
      to: Urls.viewDatabase(databaseId),
      isVisible: hasDatabaseManagementAccess,
    },
    {
      key: "data-model",
      label: t`Edit metadata`,
      icon: "label",
      to: hasDataStudioAccess
        ? Urls.dataStudioData({ databaseId })
        : Urls.dataModel({ databaseId }),
      isVisible: hasDataModelAccess,
    },
    {
      key: "schema-viewer",
      label: t`View schema`,
      icon: "network",
      to: Urls.dataStudioSchemaViewer({ databaseId }),
      isVisible: hasDataStudioAccess && PLUGIN_SCHEMA_VIEWER.isEnabled,
    },
  ];

  return links.filter((link) => link.isVisible);
}
