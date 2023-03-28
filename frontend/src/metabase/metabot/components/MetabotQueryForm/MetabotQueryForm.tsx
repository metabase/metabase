import React, { useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
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
  onSubmit: (question: Question) => void;
  onCancel: () => void;
}

export const MetabotQueryForm = ({
  question,
  onSubmit,
  onCancel,
}: MetabotQueryFormProps) => {
  const [updatedQuestion, setUpdatedQuestion] = useState(question);
  const handleSubmit = () => onSubmit(updatedQuestion);

  return (
    <QueryEditorRoot>
      <QueryEditorTitle>{t`Here’s the generated SQL`}</QueryEditorTitle>
      <QueryEditorContainer>
        <MetabotQueryEditor
          question={question}
          isReadOnly
          isFullHeight
          isInitiallyOpen
        />
      </QueryEditorContainer>
      <QueryEditorTitle>{t`What should the SQL have been?`}</QueryEditorTitle>
      <QueryEditorContainer>
        <MetabotQueryEditor
          question={updatedQuestion}
          isFullHeight
          isInitiallyOpen
          setDatasetQuery={setUpdatedQuestion}
        />
      </QueryEditorContainer>
      <QueryEditorFooter>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button primary onClick={handleSubmit}>{t`Done`}</Button>
      </QueryEditorFooter>
    </QueryEditorRoot>
  );
};

export default MetabotQueryForm;
