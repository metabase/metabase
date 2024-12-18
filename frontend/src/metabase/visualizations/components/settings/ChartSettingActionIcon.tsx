import type { MouseEvent } from "react";

import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  type ActionIconProps,
  Icon,
  type IconName,
} from "metabase/ui";

interface ChartSettingActionIconProps extends ActionIconProps {
  icon: IconName;
  onClick: (target: MouseEvent<HTMLButtonElement>) => void;
  "data-testid"?: string;
}

export const ChartSettingActionIcon = ({
  icon,
  onClick,
  "data-testid": dataTestId,
}: ChartSettingActionIconProps) => (
  <ActionIcon
    data-testid={dataTestId}
    onClick={e => {
      e.stopPropagation();
      onClick(e);
    }}
    p={0}
    c="text-medium"
    size="sm"
    radius="xl"
    className={CS.pointerEventsAll}
  >
    <Icon size={16} c="inherit" name={icon} />
  </ActionIcon>
);
