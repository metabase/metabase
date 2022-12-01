import React from "react";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import type Query from "metabase-lib/queries/Query";

import type Question from "metabase-lib/Question";
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
