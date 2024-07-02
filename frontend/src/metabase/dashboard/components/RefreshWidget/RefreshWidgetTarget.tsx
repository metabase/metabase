import { t } from "ttag";

import { CountdownIcon } from "metabase/components/icons/CountdownIcon";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { isNotNull } from "metabase/lib/types";
import { Tooltip } from "metabase/ui";

export const RefreshWidgetTarget = ({
  period,
  elapsed,
}: {
  elapsed: number | null;
  period: number | null;
}) => {
  const showRemaining = isNotNull(elapsed) && isNotNull(period);

  if (!showRemaining) {
    return (
      <Tooltip label={t`Auto-refresh`}>
        <DashboardHeaderButton icon="clock" aria-label={t`Auto Refresh`} />
      </Tooltip>
    );
  }

  const remaining = period - elapsed;

  return (
    <Tooltip
      label={
        t`Refreshing in` +
        " " +
        Math.floor(remaining / 60) +
        ":" +
        (remaining % 60 < 10 ? "0" : "") +
        Math.round(remaining % 60)
      }
    >
      <DashboardHeaderButton
        icon={
          <CountdownIcon
            width={16}
            height={16}
            percent={Math.min(0.95, remaining / period)}
          />
        }
        aria-label={t`Auto Refresh`}
      />
    </Tooltip>
  );
};
