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
    onClick={(e) => {
      e.stopPropagation();
      onClick?.(e);
    }}
    p={0}
    c="text-secondary"
    size="sm"
    radius="xl"
    className={CS.pointerEventsAuto}
  >
    <Icon size={16} name={icon} className={CS.pointerEventsNone} />
  </ActionIcon>
);
