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
  feedbackType: MetabotFeedbackType | undefined;
  isSubmitted: boolean;
  onFeedbackTypeChange: (type: MetabotFeedbackType) => void;
  onFeedbackSubmit: (message: string) => void;
}

const MetabotFeedbackForm = ({
  feedbackType,
  isSubmitted,
  onFeedbackTypeChange,
  onFeedbackSubmit,
}: MetabotFeedbackFormProps) => {
  return (
    <FormRoot>
      <FeedbackFormContent
        feedbackType={feedbackType}
        isSubmitted={isSubmitted}
        onFeedbackTypeChange={onFeedbackTypeChange}
        onFeedbackSubmit={onFeedbackSubmit}
      />
    </FormRoot>
  );
};

const FeedbackFormContent = ({
  feedbackType,
  isSubmitted,
  onFeedbackTypeChange,
  onFeedbackSubmit,
}: MetabotFeedbackFormProps) => {
  if (isSubmitted) {
    return <MetabotMessage>{t`Thanks for the feedback!`}</MetabotMessage>;
  }

  switch (feedbackType) {
    case "great":
      return <MetabotMessage>{t`Glad to hear it!`}</MetabotMessage>;
    case "wrong-data":
      return (
        <FeedbackMessageForm
          title={t`What data should it have used?`}
          placeholder={t`Type the name of the data it should have used.`}
          onSubmit={onFeedbackSubmit}
        />
      );
    case "incorrect-result":
      return (
        <FeedbackMessageForm
          title={t`Sorry about that.`}
          placeholder={t`Describe what’s wrong`}
          onSubmit={onFeedbackSubmit}
        />
      );
    default:
      return <FeedbackTypeSelect onFeedbackTypeChange={onFeedbackTypeChange} />;
  }
};

interface FeedbackTypeSelectProps {
  onFeedbackTypeChange: (type: MetabotFeedbackType) => void;
}

const FeedbackTypeSelect = ({
  onFeedbackTypeChange,
}: FeedbackTypeSelectProps) => {
  const handleGreat = () => onFeedbackTypeChange("great");
  const handleWrongData = () => onFeedbackTypeChange("wrong-data");
  const handleIncorrectResult = () => onFeedbackTypeChange("incorrect-result");
  const handleInvalidSql = () => onFeedbackTypeChange("invalid-sql");

  return (
    <FormSection>
      <MetabotMessage>{t`How did I do?`}</MetabotMessage>
      <Button onClick={handleGreat}>{t`This is great!`}</Button>
      <Button onClick={handleWrongData}>{t`This used the wrong data.`}</Button>
      <Button onClick={handleIncorrectResult}>
        {t`This result isn’t correct.`}
      </Button>
      <Button onClick={handleInvalidSql}>{t`This isn’t valid SQL.`}</Button>
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
