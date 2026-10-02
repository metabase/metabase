import { type MouseEvent, useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { canAccessDataModel, getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_SCHEMA_VIEWER } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DatabaseId, IconName } from "metabase-types/api";

type DatabaseQuickLink = {
  key: string;
  label: string;
  icon: IconName;
  to: string;
};

export function useDatabaseQuickLinks(
  databaseId: DatabaseId,
): DatabaseQuickLink[] {
  const isAdmin = useSelector(getUserIsAdmin);
  const hasDataModelAccess = useSelector(canAccessDataModel);
  const hasDataStudioAccess = useSelector(canAccessDataStudio);

  const links: DatabaseQuickLink[] = [];

  if (isAdmin) {
    links.push({
      key: "manage",
      label: t`Manage database`,
      icon: "gear",
      to: Urls.viewDatabase(databaseId),
    });
  }

  if (hasDataModelAccess) {
    links.push({
      key: "data-model",
      label: t`Edit metadata`,
      icon: "label",
      to: hasDataStudioAccess
        ? Urls.dataStudioData({ databaseId })
        : Urls.dataModel({ databaseId }),
    });
  }

  if (hasDataStudioAccess && PLUGIN_SCHEMA_VIEWER.isEnabled) {
    links.push({
      key: "schema-viewer",
      label: t`View schema`,
      icon: "network",
      to: Urls.dataStudioSchemaViewer({ databaseId }),
    });
  }

  return links;
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

  if (links.length === 0) {
    return null;
  }

  // The menu can sit inside a card that is itself a link, so clicks on it
  // must not reach the card
  const handleTargetClick = (event: MouseEvent) => {
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
          onClick={handleTargetClick}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        {links.map((link) => (
          <Menu.Item
            key={link.key}
            component={Link}
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
