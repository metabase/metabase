import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import { ACE_ELEMENT_ID } from "metabase/query_builder/components/NativeQueryEditor/constants";

import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type Question from "metabase-lib/Question";

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
      viewHeight="full"
      setDatasetQuery={onChangeQuestionQuery}
      enableRun={true}
      hasEditingSidebar={false}
      isNativeEditorOpen
      hasParametersList={false}
      resizable={false}
      readOnly={!isEditable}
      editorContext="action"
    />
  );
}

export { ACE_ELEMENT_ID };

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QueryActionEditor;
