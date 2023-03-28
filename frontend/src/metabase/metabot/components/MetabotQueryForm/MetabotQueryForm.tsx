import React, { useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { MetabotFeedbackType } from "metabase-types/api";
import Question from "metabase-lib/Question";
import MetabotQueryEditor from "../MetabotQueryEditor";
import {
  QueryEditorContainer,
  QueryEditorFooter,
  QueryEditorRoot,
  QueryEditorTitle,
} from "./MetabotQueryForm.styled";

interface MetabotQueryFormProps {
  question: Question;
  onFeedbackChange: (feedbackType?: MetabotFeedbackType) => void;
  onNativeQuerySubmit: (question: Question) => void;
}

export const MetabotQueryForm = ({
  question,
  onFeedbackChange,
  onNativeQuerySubmit,
}: MetabotQueryFormProps) => {
  const [updatedQuestion, setUpdatedQuestion] = useState(question);
  const handleSubmit = () => onNativeQuerySubmit(updatedQuestion);
  const handleCancel = () => onFeedbackChange();

  return (
    <QueryEditorRoot>
      <QueryEditorTitle>{t`Here’s the generated SQL`}</QueryEditorTitle>
      <QueryEditorContainer>
        <MetabotQueryEditor question={question} isReadOnly isInitiallyOpen />
      </QueryEditorContainer>
      <QueryEditorTitle>{t`What should the SQL have been?`}</QueryEditorTitle>
      <QueryEditorContainer>
        <MetabotQueryEditor
          question={updatedQuestion}
          isInitiallyOpen
          onChange={setUpdatedQuestion}
        />
      </QueryEditorContainer>
      <QueryEditorFooter>
        <Button onClick={handleCancel}>{t`Cancel`}</Button>
        <Button primary onClick={handleSubmit}>{t`Done`}</Button>
      </QueryEditorFooter>
    </QueryEditorRoot>
  );
};

export default MetabotQueryForm;
