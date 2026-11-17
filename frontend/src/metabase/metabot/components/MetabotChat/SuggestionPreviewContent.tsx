import { unifiedMergeView } from "@codemirror/merge";
import cx from "classnames";
import { useMemo } from "react";
import _ from "underscore";

import { CodeMirror } from "metabase/common/components/CodeMirror";
import EditorS from "metabase/querying/components/CodeMirrorEditor/CodeMirrorEditor.module.css";

import S from "./MetabotAgentSuggestionMessage.module.css";

export type SuggestionPreviewContentProps = {
  oldSource: string;
  newSource: string;
};

export const SuggestionPreviewContent = ({
  oldSource,
  newSource,
}: SuggestionPreviewContentProps) => {
  const extensions = useMemo(
    () =>
      _.compact([
        oldSource &&
          unifiedMergeView({
            original: oldSource,
            mergeControls: false,
            collapseUnchanged: {
              margin: 1,
              minSize: 1,
            },
          }),
      ]),
    [oldSource],
  );

  return (
    <CodeMirror
      className={cx(
        EditorS.editor,
        S.suggestionEditor,
        !oldSource && S.suggestionEditorOnlyNew,
      )}
      extensions={extensions}
      value={newSource}
      readOnly
      autoCorrect="off"
    />
  );
};
