import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import { RunButtonWithTooltip } from "metabase/query_builder/components/RunButtonWithTooltip";
import type * as Lib from "metabase-lib";

import S from "./NativeQueryEditorRunButton.module.css";

interface NativeQueryEditorRunButtonProps {
  cancelQuery?: () => void;
  isResultDirty: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  nativeEditorSelectedText?: string | null;
  questionErrors?: Lib.ValidationError[] | null;
  runQuery?: () => void;
}

export const NativeQueryEditorRunButton = (
  props: NativeQueryEditorRunButtonProps,
) => {
  const {
    cancelQuery,
    isResultDirty,
    isRunnable,
    isRunning,
    nativeEditorSelectedText,
    questionErrors,
    runQuery,
  } = props;

  const getTooltip = () => {
    if (questionErrors && questionErrors.length > 0) {
      return questionErrors[0].message;
    }

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
