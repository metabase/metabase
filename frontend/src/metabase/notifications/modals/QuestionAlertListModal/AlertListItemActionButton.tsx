import type { JSX, MouseEventHandler } from "react";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";
interface Props {
  label: string;
  iconName: IconName;
  onClick: MouseEventHandler;
}

export const AlertListItemActionButton = ({
  label,
  iconName,
  onClick,
}: Props): JSX.Element => (
  <Tooltip label={label}>
    <ActionIcon variant="subtle" size="sm" aria-label={label} onClick={onClick}>
      <Icon name={iconName} />
    </ActionIcon>
  </Tooltip>
);
