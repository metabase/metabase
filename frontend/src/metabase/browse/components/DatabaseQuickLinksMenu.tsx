import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { DatabaseId, SchemaName } from "metabase-types/api";

import { useDatabaseQuickLinks } from "./use-database-quick-links";

type DatabaseQuickLinksMenuProps = {
  databaseId: DatabaseId;
  schemaName?: SchemaName;
  className?: string;
};

export const DatabaseQuickLinksMenu = ({
  databaseId,
  schemaName,
  className,
}: DatabaseQuickLinksMenuProps) => {
  const links = useDatabaseQuickLinks(databaseId, schemaName);

  const isVirtualDatabase = databaseId === SAVED_QUESTIONS_VIRTUAL_DB_ID;
  if (links.length === 0 || isVirtualDatabase) {
    return null;
  }

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          className={className}
          size="sm"
          aria-label={t`Database options`}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
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
