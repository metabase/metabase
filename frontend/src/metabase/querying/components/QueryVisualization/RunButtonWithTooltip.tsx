import { t } from "ttag";

import { Tooltip } from "metabase/ui";
import { duration } from "metabase/utils/formatting";
import type { Dataset } from "metabase-types/api";

import { RunButton, type RunButtonProps } from "./RunButton";

const REFRESH_TOOLTIP_THRESHOLD = 30 * 1000; // 30 seconds

type TooltipInput = {
  isDirty?: boolean;
  result?: Dataset | null;
};

type RunButtonWithTooltipProps = RunButtonProps &
  TooltipInput & {
    getTooltip?: (props: TooltipInput) => string | null;
  };

const defaultGetTooltip = ({ isDirty, result }: TooltipInput) => {
  const { cached, average_execution_time } = result || {};
  return !isDirty &&
    cached &&
    average_execution_time != null &&
    average_execution_time > REFRESH_TOOLTIP_THRESHOLD
    ? t`This question will take approximately ${duration(
        average_execution_time,
      )} to refresh`
    : null;
};

export function RunButtonWithTooltip({
  getTooltip = defaultGetTooltip,
  ...props
}: RunButtonWithTooltipProps) {
  const tooltip = getTooltip(props);
  return (
    <Tooltip label={tooltip} disabled={!tooltip} position="top">
      <RunButton {...props} />
    </Tooltip>
  );
}
