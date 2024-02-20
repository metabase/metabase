/* eslint-disable react/prop-types */
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { duration } from "metabase/lib/formatting";

import RunButton from "./RunButton";

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

export default function RunButtonWithTooltip({
  getTooltip = defaultGetTooltip,
  ...props
}) {
  return (
    <Tooltip tooltip={getTooltip(props)} placement="top">
      <RunButton {...props} />
    </Tooltip>
  );
}
