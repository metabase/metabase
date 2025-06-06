import { t } from "ttag";

import { ActionIcon, Group, Icon, Text, Tooltip } from "metabase/ui";
import type { TableActionDisplaySettings } from "metabase-types/api";

type RowActionItemProps = {
  action: TableActionDisplaySettings;
  onRemove: (id: TableActionDisplaySettings["id"]) => void;
  onEdit: (action: TableActionDisplaySettings) => void;
};

export const RowActionItem = ({
  action,
  onRemove,
  onEdit,
}: RowActionItemProps) => {
  const { id, name } = action;

  return (
    <Group justify="space-between" align="center">
      <Text>{name}</Text>
      <Group>
        <Tooltip label={t`Edit`}>
          <ActionIcon
            p={0}
            c="text-medium"
            size="sm"
            radius="xl"
            onClick={() => onEdit(action)}
          >
            <Icon size={16} name="gear" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Remove`}>
          <ActionIcon
            p={0}
            c="text-medium"
            size="sm"
            radius="xl"
            onClick={() => onRemove(id)}
          >
            <Icon size={16} name="close" />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
};
