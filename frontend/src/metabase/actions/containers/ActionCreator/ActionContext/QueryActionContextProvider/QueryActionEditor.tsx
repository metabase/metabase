import { NativeQueryEditor } from "metabase/querying/components/NativeQueryEditor";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";

function QueryActionEditor({
  query,
  question,
  isEditable,
  onChangeQuestionQuery,
}: {
  query: NativeQuery;
  question: Question;
  isEditable: boolean;
  onChangeQuestionQuery: (query: NativeQuery) => void;
}) {
  return (
    <NativeQueryEditor
      query={query}
      question={question}
      setDatasetQuery={onChangeQuestionQuery}
      isNativeEditorOpen
      resizable={false}
      readOnly={!isEditable}
      editorContext="action"
    >
      <NativeQueryEditor.TopBar />
    </NativeQueryEditor>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QueryActionEditor;
