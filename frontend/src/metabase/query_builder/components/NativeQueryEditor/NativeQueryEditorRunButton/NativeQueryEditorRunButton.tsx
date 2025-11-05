import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";

import S from "./NativeQueryEditorRunButton.module.css";

interface NativeQueryEditorRunButtonProps {
  cancelQuery?: () => void;
  isResultDirty: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  nativeEditorSelectedText?: string;
  runQuery?: () => void;
}

const NativeQueryEditorRunButton = (props: NativeQueryEditorRunButtonProps) => {
  const {
    cancelQuery,
    isResultDirty,
    isRunnable,
    isRunning,
    nativeEditorSelectedText,
    runQuery,
  } = props;

  const getTooltip = () => {
    const command = nativeEditorSelectedText
      ? t`Run selected text`
      : t`Run query`;
    const shortcut = t`(${METAKEY} + enter)`;
    return command + " " + shortcut;
  };

  const canRunQuery = runQuery && cancelQuery;

  if (!canRunQuery) {
    return null;
  }

  return (
    <RunButtonWithTooltip
      className={S.RunButtonWithTooltipStyled}
      disabled={!isRunnable}
      isRunning={isRunning}
      isDirty={isResultDirty}
      onRun={runQuery}
      onCancel={cancelQuery}
      getTooltip={getTooltip}
    />
  );
};

export { NativeQueryEditorRunButton };
