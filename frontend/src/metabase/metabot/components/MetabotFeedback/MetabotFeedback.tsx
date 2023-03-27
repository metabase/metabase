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
  onTypeChange: (newType: MetabotFeedbackType) => void;
  onSubmit: (newMessage: string) => void;
}

const MetabotFeedback = ({
  type,
  onTypeChange,
  onSubmit,
}: MetabotFeedbackProps) => {
  switch (type) {
    case "great":
      return <GreatFeedbackMessage />;
    case "wrong-data":
      return <WrongDataForm onSubmit={onSubmit} />;
    default:
      return <FeedbackSelection onTypeChange={onTypeChange} />;
  }
};

interface FeedbackSelectionProps {
  onTypeChange: (newType: MetabotFeedbackType) => void;
}

const FeedbackSelection = ({ onTypeChange }: FeedbackSelectionProps) => {
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

const GreatFeedbackMessage = () => {
  return <MetabotMessage>{t`Glad to hear it!`}</MetabotMessage>;
};

interface WrongDataFormProps {
  onSubmit: (message: string) => void;
}

const WrongDataForm = ({ onSubmit }: WrongDataFormProps) => {
  return (
    <FeedbackSection>
      <MetabotMessage>{t`What data should it have used?`}</MetabotMessage>
      <FeedbackForm
        placeholder={t`Type the name of the data it should have used.`}
        onSubmit={onSubmit}
      />
    </FeedbackSection>
  );
};

interface FeedbackFormProps {
  placeholder: string;
  onSubmit: (message: string) => void;
}

interface FeedbackFormValues {
  message: string;
}

const FeedbackForm = ({ placeholder, onSubmit }: FeedbackFormProps) => {
  const initialValues = { message: "" };
  const handleSubmit = ({ message }: FeedbackFormValues) => onSubmit(message);

  return (
    <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
      {({ dirty }) => (
        <InlineForm disabled={!dirty}>
          <InlineFormInput name="message" placeholder={placeholder} />
          <InlineFormSubmitButton title="" icon="check" primary />
        </InlineForm>
      )}
    </FormProvider>
  );
};

export default MetabotFeedback;
