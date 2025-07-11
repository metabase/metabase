import cx from "classnames";
import { type HTMLAttributes, forwardRef } from "react";

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

export const ChartSettingActionIcon = forwardRef<
  HTMLButtonElement,
  ChartSettingActionIconProps
>(function ChartSettingActionIcon(
  { icon, onClick, "data-testid": dataTestId, className },
  ref,
) {
  return (
    <ActionIcon
      data-testid={dataTestId}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      p={0}
      c="text-medium"
      size="sm"
      radius="xl"
      className={cx(className, CS.pointerEventsAuto)}
      ref={ref}
    >
      <Icon size={16} name={icon} className={CS.pointerEventsNone} />
    </ActionIcon>
  );
});
