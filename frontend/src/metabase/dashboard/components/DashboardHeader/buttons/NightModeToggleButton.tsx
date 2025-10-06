import type { ButtonHTMLAttributes } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDashboardContext } from "metabase/dashboard/context";
import type { ActionIconProps } from "metabase/ui";

export const NightModeToggleButton = (
  props: ActionIconProps & ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  const { isNightMode, onNightModeChange } = useDashboardContext();

  const label = isNightMode ? t`Daytime mode` : t`Nighttime mode`;
  return (
    <ToolbarButton
      icon={isNightMode ? "sun" : "moon"}
      onClick={() => onNightModeChange?.(!isNightMode)}
      tooltipLabel={label}
      aria-label={label}
      {...props}
    />
  );
};
