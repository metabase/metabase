import { t } from "ttag";

import { DashboardHeaderButton } from "./DashboardHeaderButton";

export const NightModeToggleButton = ({
  isNightMode,
  onNightModeChange,
}: {
  isNightMode: boolean | undefined;
  onNightModeChange: (isNightMode: boolean) => void;
}) => {
  const label = isNightMode ? t`Daytime mode` : t`Nighttime mode`;
  return (
    <DashboardHeaderButton
      icon={isNightMode ? "sun" : "moon"}
      onClick={() => onNightModeChange(!isNightMode)}
      tooltipLabel={label}
      aria-label={label}
    />
  );
};
