import React from "react";

import type Question from "metabase-lib/lib/Question";
import type { DatasetQuery } from "metabase-types/types/Card";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
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
        setDatasetQuery={(newQuery: DatasetQuery) =>
          setQuestion(question.setDatasetQuery(newQuery))
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
