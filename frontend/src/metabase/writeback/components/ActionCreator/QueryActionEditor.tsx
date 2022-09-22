import React from "react";

import type { Query } from "metabase-types/types/Card";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import type Question from "metabase-lib/lib/Question";
import { EditorContainer } from "./ActionCreator.styled";

export function QueryActionEditor({
  question,
  setQuestion,
}: {
  question: Question;
  setQuestion: (q: Question) => void;
}) {
  return (
    <EditorContainer>
      <NativeQueryEditor
        query={question.query()}
        viewHeight="full"
        setDatasetQuery={(newQuery: Query) =>
          setQuestion(question.setQuery(newQuery))
        }
        enableRun={false}
        hasEditingSidebar={false} // TODO: make sidebar components work in popovers
        isNativeEditorOpen
        hasParametersList={false}
        resizable={false}
        readOnly={false}
        requireWriteback
      />
    </EditorContainer>
  );
}
