import { t } from "ttag";

import { ActionIcon, Checkbox, Group, Icon, Tooltip } from "metabase/ui";
import type { WritebackAction } from "metabase-types/api";

type RowActionItemProps = {
  action: WritebackAction;

  isEnabled: boolean;
  onToggle: ({ id, enabled }: { id: number; enabled: boolean }) => void;
  onRemove: (id: number) => void;
};

export const RowActionItem = ({
  action,
  isEnabled,
  onToggle,
  onRemove,
}: RowActionItemProps) => {
  const { id, name } = action;

  return (
    <Group justify="space-between" align="center">
      <Checkbox
        key={id}
        label={name}
        checked={isEnabled}
        onChange={() => onToggle({ id, enabled: !isEnabled })}
      />
      <Group>
        <Tooltip label={t`Edit`}>
          <ActionIcon
            onClick={() => onRemove(id)}
            p={0}
            c="text-medium"
            size="sm"
            radius="xl"
          >
            <Icon size={16} name="gear" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Remove`}>
          <ActionIcon
            onClick={() => onRemove(id)}
            p={0}
            c="text-medium"
            size="sm"
            radius="xl"
          >
            <Icon size={16} name="close" />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
};
