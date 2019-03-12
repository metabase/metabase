import React from "react";

import { t } from "c-3po";
import { duration } from "metabase/lib/formatting";

import Tooltip from "metabase/components/Tooltip";
import RunButton from "./RunButton";

const REFRESH_TOOLTIP_THRESHOLD = 30 * 1000; // 30 seconds

const RunButtonWithTooltip = ({
  result,
  isRunnable,
  isResultDirty,
  isRunning,
  onRun,
  onCancel,
  className,
}) => {
  let runButtonTooltip;
  if (
    !isResultDirty &&
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
      <RunButton
        className={className}
        isRunnable={isRunnable}
        isDirty={isResultDirty}
        isRunning={isRunning}
        onRun={onRun}
        onCancel={onCancel}
      />
    </Tooltip>
  );
};

export default RunButtonWithTooltip;
