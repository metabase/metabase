import * as Lib from "metabase-lib";

import { NativeQueryEditorRunButton } from "../NativeQueryEditorRunButton/NativeQueryEditorRunButton";
import { useNativeQueryEditorContext } from "../context/NativeQueryEditorContext";

/**
 * The run/cancel button shown over the editor surface. Renders nothing while
 * the editor is read-only or when no run handler is wired up.
 */
export function RunButton() {
  const {
    question,
    readOnly,
    isRunnable,
    isRunning,
    isResultDirty,
    nativeEditorSelectedText,
    runQuery,
    cancelQuery,
  } = useNativeQueryEditorContext();

  if (readOnly || !runQuery || !cancelQuery) {
    return null;
  }

  return (
    <NativeQueryEditorRunButton
      cancelQuery={cancelQuery}
      isResultDirty={isResultDirty}
      isRunnable={isRunnable}
      isRunning={isRunning}
      nativeEditorSelectedText={nativeEditorSelectedText}
      runQuery={runQuery}
      questionErrors={Lib.validateTemplateTags(question.query())}
    />
  );
}
