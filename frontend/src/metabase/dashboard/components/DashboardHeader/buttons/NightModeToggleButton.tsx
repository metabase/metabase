import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDashboardContext } from "metabase/dashboard/context";
import { ActionIconProps } from "metabase/ui";
import { ButtonHTMLAttributes } from "react";

export const NightModeToggleButton = () => {
  const { isNightMode, onNightModeChange, theme } = useDashboardContext();

  console.log("this is the button i'm clicking on right", isNightMode, theme);
  const label = isNightMode ? t`Daytime mode` : t`Nighttime mode`;
  return (
    <ToolbarButton
      icon={isNightMode ? "sun" : "moon"}
      onClick={() => onNightModeChange?.(!isNightMode)}
      tooltipLabel={label}
      aria-label={label}
    />
  );
};
