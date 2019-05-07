import React from "react";

import { t } from "ttag";
import { duration } from "metabase/lib/formatting";

import Tooltip from "metabase/components/Tooltip";
import RunButton from "./RunButton";

const REFRESH_TOOLTIP_THRESHOLD = 30 * 1000; // 30 seconds

const RunButtonWithTooltip = props => {
  const { isDirty, result } = props;
  let runButtonTooltip;
  if (
    !isDirty &&
    result &&
    result.cached &&
    result.average_execution_time > REFRESH_TOOLTIP_THRESHOLD
  ) {
    runButtonTooltip = t`This question will take approximately ${duration(
      result.average_execution_time,
    )} to refresh`;
  }

  return (
    <Tooltip tooltip={runButtonTooltip}>
      <RunButton {...props} />
    </Tooltip>
  );
};

export default RunButtonWithTooltip;
