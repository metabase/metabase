import { type MouseEvent, useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { canAccessDataModel } from "metabase/current-user";
import { PLUGIN_SCHEMA_VIEWER } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getAdminPaths } from "metabase/selectors/admin";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { DatabaseId, IconName } from "metabase-types/api";

type DatabaseQuickLink = {
  key: string;
  label: string;
  icon: IconName;
  to: string;
  isVisible: boolean;
};

// Matches the route guard on /admin/databases
const canManageDatabases = (state: State) =>
  getAdminPaths(state).some((path) => path.key === "databases");

function useDatabaseQuickLinks(databaseId: DatabaseId): DatabaseQuickLink[] {
  const hasDatabaseAccess = useSelector(canManageDatabases);
  const hasDataModelAccess = useSelector(canAccessDataModel);
  const hasDataStudioAccess = useSelector(canAccessDataStudio);

  const links: DatabaseQuickLink[] = [
    {
      key: "manage",
      label: t`Manage database`,
      icon: "gear",
      to: Urls.viewDatabase(databaseId),
      isVisible: hasDatabaseAccess,
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

type DatabaseQuickLinksMenuProps = {
  databaseId: DatabaseId;
  className?: string;
};

export const DatabaseQuickLinksMenu = ({
  databaseId,
  className,
}: DatabaseQuickLinksMenuProps) => {
  const links = useDatabaseQuickLinks(databaseId);
  const [isOpened, setIsOpened] = useState(false);

  const isVirtualDatabase = databaseId === SAVED_QUESTIONS_VIRTUAL_DB_ID;
  if (links.length === 0 || isVirtualDatabase) {
    return null;
  }

  // The menu can sit inside a card that is itself a link
  const preventCardNavigation = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Menu position="bottom-end" opened={isOpened} onChange={setIsOpened}>
      <Menu.Target>
        <ActionIcon
          // Keep the button visible while its menu is open, even after the
          // pointer leaves a hover-to-reveal parent
          className={isOpened ? undefined : className}
          size="sm"
          color="text-secondary"
          aria-label={t`Database options`}
          onClick={preventCardNavigation}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        {links.map((link) => (
          <Menu.Item
            key={link.key}
            component={ForwardRefLink}
            to={link.to}
            leftSection={<Icon name={link.icon} />}
          >
            {link.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
