import { c, t } from "ttag";

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
        aria-label={t`Auto-refresh`}
      />
    );
  }

  const remaining = period - elapsed;

  return (
    <ToolbarButton
      tooltipLabel={c("{0} is a time like 1:30 (meaning 1 minute 30 seconds)")
        .t`Refreshing in ${formatTime(remaining)}`}
      name="clock"
      aria-label={t`Auto-refresh`}
    >
      <CountdownIcon
        width={16}
        height={16}
        percent={Math.min(0.95, remaining / period)}
      />
    </ToolbarButton>
  );
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};
