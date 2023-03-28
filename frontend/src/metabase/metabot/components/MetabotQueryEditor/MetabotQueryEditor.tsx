import React, { useState } from "react";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import ExplicitSize from "metabase/components/ExplicitSize";
import Question from "metabase-lib/Question";
import NativeQuery from "metabase-lib/queries/NativeQuery";

interface MetabotQueryEditor {
  question: Question;
  height: number;
  isReadOnly?: boolean;
  hasTopBar?: boolean;
  isFullHeight?: boolean;
  isInitiallyOpen?: boolean;
  onChange?: (question: Question) => void;
}

const MetabotQueryEditor = ({
  question,
  height,
  isReadOnly = false,
  hasTopBar = false,
  isFullHeight = false,
  isInitiallyOpen = false,
  onChange,
}: MetabotQueryEditor) => {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen);
  const handleChange = (query: NativeQuery) => onChange?.(query.question());
  const resizableBoxProps = isFullHeight ? { minConstraints: [0, 0] } : {};

  return (
    <NativeQueryEditor
      question={question.setId(-1)}
      query={question.query()}
      viewHeight={height}
      isReadOnly={isReadOnly}
      resizable={false}
      resizableBoxProps={resizableBoxProps}
      hasTopBar={hasTopBar}
      hasParametersList={false}
      canChangeDatabase={false}
      hasEditingSidebar={false}
      isInitiallyOpen={isInitiallyOpen}
      isNativeEditorOpen={isOpen}
      setDatasetQuery={handleChange}
      setIsNativeEditorOpen={setIsOpen}
    />
  );
};

export default ExplicitSize()(MetabotQueryEditor);
