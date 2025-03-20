import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { useDashboardContext } from "metabase/dashboard/context";

export const NightModeToggleButton = () => {
  const { isNightMode, onNightModeChange } = useDashboardContext();

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
