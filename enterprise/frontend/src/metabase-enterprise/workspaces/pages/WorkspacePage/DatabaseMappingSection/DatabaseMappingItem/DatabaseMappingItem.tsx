import { t } from "ttag";

import { ActionIcon, Badge, Flex, Icon, Menu, Text } from "metabase/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";

import { isDatabaseProvisioned } from "../../../../utils";

type DatabaseMappingItemProps = {
  mapping: WorkspaceDatabase;
  database?: Database;
  isReadOnly: boolean;
  onEdit: () => void;
  onRemove: () => void;
};

export function DatabaseMappingItem({
  mapping,
  database,
  isReadOnly,
  onEdit,
  onRemove,
}: DatabaseMappingItemProps) {
  const color = isDatabaseProvisioned(mapping) ? "success" : "warning";

  return (
    <Flex
      justify="space-between"
      align="center"
      py="md"
      data-testid="workspace-db-list-item"
    >
      <Flex align="center" gap="sm">
        <Badge size="12" circle bg={color} style={{ flexShrink: 0 }} />
        <Text>{database?.name ?? `#${mapping.database_id}`}</Text>
      </Flex>
      <Menu shadow="md" width={160} position="bottom-end">
        <Menu.Target>
          <ActionIcon size="sm" aria-label={t`More actions`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="pencil" />}
            disabled={isReadOnly}
            onClick={onEdit}
          >
            {t`Edit`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            disabled={isReadOnly}
            onClick={onRemove}
          >
            {t`Remove`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Flex>
  );
}
