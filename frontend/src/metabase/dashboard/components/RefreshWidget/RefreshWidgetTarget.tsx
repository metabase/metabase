import type { ButtonHTMLAttributes } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton/ToolbarButton";
import { CountdownIcon } from "metabase/common/components/icons/CountdownIcon";
import { isNotNull } from "metabase/lib/types";
import type { ActionIconProps } from "metabase/ui";

type RefreshWidgetTargetProps = {
  period: number | null;
  elapsed: number | null;
} & ActionIconProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

export const RefreshWidgetTarget = ({
  period,
  elapsed,
  ...buttonProps
}: RefreshWidgetTargetProps) => {
  const showRemaining = isNotNull(elapsed) && isNotNull(period);

  if (!showRemaining) {
    return (
      <ToolbarButton
        tooltipLabel={t`Auto-refresh`}
        icon="clock"
        aria-label={t`Auto Refresh`}
        {...buttonProps}
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
      {...buttonProps}
    >
      <CountdownIcon
        width={16}
        height={16}
        percent={Math.min(0.95, remaining / period)}
      />
    </ToolbarButton>
  );
};
