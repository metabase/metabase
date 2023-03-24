import React, { useState } from "react";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import ExplicitSize from "metabase/components/ExplicitSize";
import Question from "metabase-lib/Question";

interface MetabotQueryEditor {
  question: Question;
  height: number;
}

const MetabotQueryEditor = ({ question, height }: MetabotQueryEditor) => {
  const [isNativeEditorOpen, setIsNativeEditorOpen] = useState(false);

  return (
    <NativeQueryEditor
      isInitiallyOpen={false}
      resizable={false}
      hasParametersList={false}
      canChangeDatabase={false}
      hasEditingSidebar={false}
      // HACK: Prevents initial opening of the query editor
      // isInitiallyOpen is ignored in purpose, not changing this behavior for the prototype
      question={question.setId(-1)}
      query={question.query()}
      viewHeight={height}
      isNativeEditorOpen={isNativeEditorOpen}
      setIsNativeEditorOpen={setIsNativeEditorOpen}
    />
  );
};

export default ExplicitSize()(MetabotQueryEditor);
