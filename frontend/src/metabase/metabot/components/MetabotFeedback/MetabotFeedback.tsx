import React from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import FormProvider from "metabase/core/components/FormProvider";
import { MetabotFeedbackType } from "metabase-types/api";
import MetabotMessage from "../MetabotMessage";
import {
  FeedbackSection,
  InlineForm,
  InlineFormInput,
  InlineFormSubmitButton,
} from "./MetabotFeedback.styled";

export interface MetabotFeedbackProps {
  type: MetabotFeedbackType | undefined;
  onTypeChange: (type: MetabotFeedbackType) => void;
  onSubmit: (message: string) => void;
}

const MetabotFeedback = ({
  type,
  onTypeChange,
  onSubmit,
}: MetabotFeedbackProps) => {
  switch (type) {
    case "great":
      return <MetabotMessage>{t`Glad to hear it!`}</MetabotMessage>;
    case "wrong-data":
      return (
        <FeedbackMessageForm
          title={t`What data should it have used?`}
          placeholder={t`Type the name of the data it should have used.`}
          onSubmit={onSubmit}
        />
      );
    case "incorrect-result":
      return (
        <FeedbackMessageForm
          title={t`Sorry about that.`}
          placeholder={t`Describe what’s wrong`}
          onSubmit={onSubmit}
        />
      );
    default:
      return <FeedbackTypeForm onTypeChange={onTypeChange} />;
  }
};

interface FeedbackTypeFormProps {
  onTypeChange: (type: MetabotFeedbackType) => void;
}

const FeedbackTypeForm = ({ onTypeChange }: FeedbackTypeFormProps) => {
  const handleGreatChange = () => onTypeChange("great");
  const handleWrongDataChange = () => onTypeChange("wrong-data");
  const handleIncorrectResultChange = () => onTypeChange("incorrect-result");
  const handleInvalidSqlChange = () => onTypeChange("invalid-sql");

  return (
    <FeedbackSection>
      <MetabotMessage>{t`How did I do?`}</MetabotMessage>
      <Button onClick={handleGreatChange}>{t`This is great!`}</Button>
      <Button onClick={handleWrongDataChange}>
        {t`This used the wrong data.`}
      </Button>
      <Button onClick={handleIncorrectResultChange}>
        {t`This result isn’t correct.`}
      </Button>
      <Button onClick={handleInvalidSqlChange}>
        {t`This isn’t valid SQL.`}
      </Button>
    </FeedbackSection>
  );
};

interface FeedbackFormValues {
  message: string;
}

interface FeedbackMessageFormProps {
  title: string;
  placeholder: string;
  onSubmit: (message: string) => void;
}

const FeedbackMessageForm = ({
  title,
  placeholder,
  onSubmit,
}: FeedbackMessageFormProps) => {
  const initialValues = { message: "" };
  const handleSubmit = ({ message }: FeedbackFormValues) => onSubmit(message);

  return (
    <FeedbackSection>
      <MetabotMessage>{title}</MetabotMessage>
      <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
        {({ dirty }) => (
          <InlineForm disabled={!dirty}>
            <InlineFormInput name="message" placeholder={placeholder} />
            <InlineFormSubmitButton title="" icon="check" primary />
          </InlineForm>
        )}
      </FormProvider>
    </FeedbackSection>
  );
};

export default MetabotFeedback;
