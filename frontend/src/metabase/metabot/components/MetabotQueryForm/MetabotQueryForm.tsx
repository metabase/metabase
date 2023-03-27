import React, { useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import Question from "metabase-lib/Question";
import {
  FormFooter,
  FormSection,
  FormSectionTitle,
} from "./MetabotQueryForm.styled";

const NATIVE_EDITOR_OPTS = {
  viewHeight: "full",
  resizable: false,
  enableRun: false,
  hasTopBar: false,
  hasParametersList: false,
  hasEditingSidebar: false,
  isNativeEditorOpen: true,
};

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
  const initialQuery = question.query();
  const [updatedQuery, setUpdatedQuery] = useState(initialQuery);
  const handleSubmit = () => onSubmit(updatedQuery.question());

  return (
    <div>
      <FormSection>
        <FormSectionTitle>{t`Here’s the generated SQL`}</FormSectionTitle>
        <NativeQueryEditor
          {...NATIVE_EDITOR_OPTS}
          query={initialQuery}
          readOnly
        />
      </FormSection>
      <FormSection>
        <FormSectionTitle>{t`What should the SQL have been?`}</FormSectionTitle>
        <NativeQueryEditor
          {...NATIVE_EDITOR_OPTS}
          query={updatedQuery}
          setDatasetQuery={setUpdatedQuery}
        />
      </FormSection>
      <FormFooter>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button primary onClick={handleSubmit}>{t`Done`}</Button>
      </FormFooter>
    </div>
  );
};

export default MetabotQueryForm;
