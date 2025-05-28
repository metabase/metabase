import { t } from "ttag";

import { ActionIcon, Group, Icon, Text, Tooltip } from "metabase/ui";
import type { WritebackAction } from "metabase-types/api";

type RowActionItemProps = {
  action: WritebackAction;
  userDefinedName?: string;
  onRemove: (id: number) => void;
  onEdit: (action: WritebackAction) => void;
};

export const RowActionItem = ({
  action,
  userDefinedName,
  onRemove,
  onEdit,
}: RowActionItemProps) => {
  const { id, name } = action;

  return (
    <Group justify="space-between" align="center">
      <Text>{userDefinedName || name}</Text>
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
