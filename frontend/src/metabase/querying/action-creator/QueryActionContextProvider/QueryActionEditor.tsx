import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { NativeQueryEditor } from "../../components/NativeQueryEditor";

export function QueryActionEditor({
  question,
  isEditable,
  onChangeQuestionQuery,
}: {
  question: Question;
  isEditable: boolean;
  onChangeQuestionQuery: (query: Lib.Query) => void;
}) {
  return (
    <NativeQueryEditor
      question={question}
      setQuery={onChangeQuestionQuery}
      isNativeEditorOpen
      resizable={false}
      readOnly={!isEditable}
      editorContext="action"
    >
      <NativeQueryEditor.TopBar />
    </NativeQueryEditor>
  );
}
