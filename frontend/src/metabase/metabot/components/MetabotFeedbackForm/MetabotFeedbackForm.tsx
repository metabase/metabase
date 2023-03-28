import React from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import FormProvider from "metabase/core/components/FormProvider";
import { MetabotFeedbackType } from "metabase-types/api";
import MetabotMessage from "../MetabotMessage";
import {
  FormRoot,
  FormSection,
  InlineForm,
  InlineFormInput,
  InlineFormSubmitButton,
} from "./MetabotFeedbackForm.styled";

export interface MetabotFeedbackFormProps {
  type: MetabotFeedbackType | undefined;
  isSubmitted: boolean;
  onTypeChange: (type: MetabotFeedbackType) => void;
  onSubmit: (message: string) => void;
}

const MetabotFeedbackForm = ({
  type,
  isSubmitted,
  onTypeChange,
  onSubmit,
}: MetabotFeedbackFormProps) => {
  return (
    <FormRoot>
      <FeedbackFormContent
        type={type}
        isSubmitted={isSubmitted}
        onTypeChange={onTypeChange}
        onSubmit={onSubmit}
      />
    </FormRoot>
  );
};

const FeedbackFormContent = ({
  type,
  isSubmitted,
  onTypeChange,
  onSubmit,
}: MetabotFeedbackFormProps) => {
  if (isSubmitted) {
    return <MetabotMessage>{t`Thanks for the feedback!`}</MetabotMessage>;
  }

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
      return <FeedbackTypeSelect onTypeChange={onTypeChange} />;
  }
};

interface FeedbackTypeSelectProps {
  onTypeChange: (type: MetabotFeedbackType) => void;
}

const FeedbackTypeSelect = ({ onTypeChange }: FeedbackTypeSelectProps) => {
  const handleGreatChange = () => onTypeChange("great");
  const handleWrongDataChange = () => onTypeChange("wrong-data");
  const handleIncorrectResultChange = () => onTypeChange("incorrect-result");
  const handleInvalidSqlChange = () => onTypeChange("invalid-sql");

  return (
    <FormSection>
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
    </FormSection>
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
    <FormSection>
      <MetabotMessage>{title}</MetabotMessage>
      <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
        {({ dirty }) => (
          <InlineForm disabled={!dirty}>
            <InlineFormInput name="message" placeholder={placeholder} />
            <InlineFormSubmitButton title="" icon="check" primary />
          </InlineForm>
        )}
      </FormProvider>
    </FormSection>
  );
};

export default MetabotFeedbackForm;
