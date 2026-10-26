import { t } from "ttag";

import { RunButtonWithTooltip } from "metabase/querying/components/QueryVisualization/RunButtonWithTooltip";
import { METAKEY } from "metabase/utils/browser";

import S from "./RefreshButton.module.css";

type RefreshButtonProps = {
  isRunning: boolean;
  isRunnable: boolean;
  isResultDirty: boolean;
  runQuery: () => void;
  cancelQuery: () => void;
};

export function RefreshButton({
  isRunning,
  isRunnable,
  isResultDirty,
  runQuery,
  cancelQuery,
}: RefreshButtonProps) {
  if (!isRunnable || isResultDirty) {
    return null;
  }

  const getTooltip = () => {
    const command = t`Run query`;
    const shortcut = t`(${METAKEY} + enter)`;
    return command + " " + shortcut;
  };

  return (
    <RunButtonWithTooltip
      className={S.refreshButton}
      isRunning={isRunning}
      isDirty={false}
      onRun={runQuery}
      onCancel={cancelQuery}
      getTooltip={getTooltip}
    />
  );
}
