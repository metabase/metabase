import React, { useCallback } from "react";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";

import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type Question from "metabase-lib/Question";

import { getTemplateTagParameters } from "metabase-lib/parameters/utils/template-tags";

function QueryActionEditor({
  question,
  setQuestion,
}: {
  question: Question;
  setQuestion: (q: Question) => void;
}) {
  const handleChange = useCallback(
    (newQuery: NativeQuery) => {
      const newParams = getTemplateTagParameters(
        newQuery.templateTagsWithoutSnippets(),
        newQuery.question().parameters(),
      );
      setQuestion(question.setQuery(newQuery).setParameters(newParams));
    },
    [question, setQuestion],
  );

  return (
    <>
      <NativeQueryEditor
        query={question.query()}
        viewHeight="full"
        setDatasetQuery={handleChange}
        enableRun={false}
        hasEditingSidebar={false}
        isNativeEditorOpen
        hasParametersList={false}
        resizable={false}
        readOnly={false}
        requireWriteback
      />
    </>
  );
}

export default QueryActionEditor;
