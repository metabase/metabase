import { t } from "ttag";

import { ActionIcon, Checkbox, Group, Icon, Tooltip } from "metabase/ui";
import type { TableAction, WritebackAction } from "metabase-types/api";

type RowActionItemProps = {
  action: WritebackAction | TableAction;

  isEnabled: boolean;
  userDefinedName?: string;
  onToggle: ({ id, enabled }: { id: number; enabled: boolean }) => void;
  onRemove: (id: number) => void;
  onEdit: (action: WritebackAction | TableAction) => void;
};

export const RowActionItem = ({
  action,
  isEnabled,
  userDefinedName,
  onToggle,
  onRemove,
  onEdit,
}: RowActionItemProps) => {
  const { id, name } = action;

  return (
    <Group justify="space-between" align="center">
      <Checkbox
        key={id}
        label={userDefinedName || name}
        checked={isEnabled}
        onChange={() => onToggle({ id, enabled: !isEnabled })}
      />
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
