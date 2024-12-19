import type { HTMLAttributes } from "react";

import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  type ActionIconProps,
  Icon,
  type IconName,
} from "metabase/ui";

type ChartActionIconProps = ActionIconProps & HTMLAttributes<HTMLButtonElement>;
interface ChartSettingActionIconProps extends ChartActionIconProps {
  icon: IconName;
  "data-testid"?: string;
}

export const ChartSettingActionIcon = ({
  icon,
  onClick,
  "data-testid": dataTestId,
}: ChartSettingActionIconProps) => (
  <ActionIcon
    data-testid={dataTestId}
    onClick={onClick}
    p={0}
    c="text-medium"
    size="sm"
    radius="xl"
    className={CS.pointerEventsAll}
  >
    <Icon size={16} c="inherit" name={icon} />
  </ActionIcon>
);
