import React from "react";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type Question from "metabase-lib/Question";

export function QueryActionEditor({
  question,
  setQuestion,
}: {
  question: Question;
  setQuestion: (q: Question) => void;
}) {
  return (
    <>
      <NativeQueryEditor
        query={question.query()}
        viewHeight="full"
        setDatasetQuery={(newQuery: NativeQuery) => {
          // we need to sync the query AND the template tags
          setQuestion(
            question
              .setQuery(newQuery)
              .setParameters(newQuery?.templateTagsWithoutSnippets()),
          );
        }}
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
