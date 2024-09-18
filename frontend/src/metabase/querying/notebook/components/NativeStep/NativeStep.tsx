import AceEditor from "react-ace";

import { color } from "metabase/lib/colors";
import { NativeQueryEditorRoot } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import * as Lib from "metabase-lib";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";

import type { NotebookStepProps } from "../../types";

export function NativeStep({ query, step }: NotebookStepProps) {
  const tableId = Lib.sourceTableOrCardId(query);
  const cardId = getQuestionIdFromVirtualTableId(tableId);
  if (cardId !== 1000) {
    return null;
  }

  const sourceCard = step.question.metadata().question(cardId);
  if (!sourceCard) {
    return null;
  }

  const sourceQuery = sourceCard.query();
  const sourceNativeQuery = Lib.rawNativeQuery(sourceQuery);

  return (
    <NativeQueryEditorRoot style={{ height: "200px", flex: 1 }}>
      <AceEditor
        value={sourceNativeQuery}
        mode="sql"
        height="100%"
        readOnly
        highlightActiveLine={false}
        navigateToFileEnd={false}
        width="100%"
        fontSize={12}
        style={{ backgroundColor: color("bg-light") }}
        showPrintMargin={false}
        setOptions={{ highlightGutterLine: false }}
      />
    </NativeQueryEditorRoot>
  );
}
