import { t } from "ttag";

import { CountdownIcon } from "metabase/components/icons/CountdownIcon";
import { isNotNull } from "metabase/lib/types";

import { ToolbarButton } from "../../../components/ToolbarButton/ToolbarButton";

type RefreshWidgetTargetProps = {
  period: number | null;
  elapsed: number | null;
};

export const RefreshWidgetTarget = ({
  period,
  elapsed,
}: RefreshWidgetTargetProps) => {
  const showRemaining = isNotNull(elapsed) && isNotNull(period);

  if (!showRemaining) {
    return (
      <ToolbarButton
        tooltipLabel={t`Auto-refresh`}
        icon="clock"
        aria-label={t`Auto Refresh`}
      />
    );
  }

  const remaining = period - elapsed;

  return (
    <ToolbarButton
      tooltipLabel={
        t`Refreshing in` +
        " " +
        Math.floor(remaining / 60) +
        ":" +
        (remaining % 60 < 10 ? "0" : "") +
        Math.round(remaining % 60)
      }
      name="clock"
      aria-label={t`Auto Refresh`}
    >
      <CountdownIcon
        width={16}
        height={16}
        percent={Math.min(0.95, remaining / period)}
      />
    </ToolbarButton>
  );
};
