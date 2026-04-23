/* eslint-disable react/prop-types */
import { t } from "ttag";

import { Tooltip } from "metabase/ui";
import { duration } from "metabase/utils/formatting";

import { RunButton } from "./RunButton";

const REFRESH_TOOLTIP_THRESHOLD = 30 * 1000; // 30 seconds

const defaultGetTooltip = ({ isDirty, result }) => {
  const { cached, average_execution_time } = result || {};
  return !isDirty &&
    cached &&
    average_execution_time > REFRESH_TOOLTIP_THRESHOLD
    ? t`This question will take approximately ${duration(
        average_execution_time,
      )} to refresh`
    : null;
};

export function RunButtonWithTooltip({
  getTooltip = defaultGetTooltip,
  ...props
}) {
  const tooltip = getTooltip(props);
  return (
    <Tooltip label={tooltip} disabled={!tooltip} position="top">
      <RunButton {...props} />
    </Tooltip>
  );
}
