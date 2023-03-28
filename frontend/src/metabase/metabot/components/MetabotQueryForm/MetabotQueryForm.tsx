import React, { useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import Question from "metabase-lib/Question";
import MetabotQueryEditor from "../MetabotQueryEditor";
import {
  QueryEditorFooter,
  QueryEditorContainer,
  QueryEditorRoot,
  QueryEditorTitle,
  QueryEditorSection,
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
      <QueryEditorSection>
        <QueryEditorTitle>{t`Here’s the generated SQL`}</QueryEditorTitle>
        <QueryEditorContainer>
          <MetabotQueryEditor question={question} readOnly isInitiallyOpen />
        </QueryEditorContainer>
      </QueryEditorSection>
      <QueryEditorSection>
        <QueryEditorTitle>{t`What should the SQL have been?`}</QueryEditorTitle>
        <QueryEditorContainer>
          <MetabotQueryEditor
            question={updatedQuestion}
            readOnly
            isInitiallyOpen
            setDatasetQuery={setUpdatedQuestion}
          />
        </QueryEditorContainer>
      </QueryEditorSection>
      <QueryEditorFooter>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button primary onClick={handleSubmit}>{t`Done`}</Button>
      </QueryEditorFooter>
    </QueryEditorRoot>
  );
};

export default MetabotQueryForm;
