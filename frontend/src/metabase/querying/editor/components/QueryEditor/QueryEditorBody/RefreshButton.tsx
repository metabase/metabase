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

  const getTooltip = () => t`Refresh query (${METAKEY} + Enter)`;

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
