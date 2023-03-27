import React, { ChangeEvent, useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import Input from "metabase/core/components/Input";
import { MetabotFeedbackType } from "metabase-types/api";
import MetabotMessage from "../MetabotMessage";
import {
  FeedbackSelectionRoot,
  WrongDataFormRoot,
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
    <FeedbackSelectionRoot>
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
    </FeedbackSelectionRoot>
  );
};

const GreatFeedbackMessage = () => {
  return <MetabotMessage>{t`Glad to hear it!`}</MetabotMessage>;
};

// Type the name of the data it should have used.

interface WrongDataFormProps {
  onSubmit: (message: string) => void;
}

const WrongDataForm = ({ onSubmit }: WrongDataFormProps) => {
  return (
    <WrongDataFormRoot>
      <MetabotMessage>{t`What data should it have used?`}</MetabotMessage>
      <FeedbackInput
        placeholder={t`Type the name of the data it should have used.`}
        onSubmit={onSubmit}
      />
    </WrongDataFormRoot>
  );
};

interface FeedbackInputProps {
  placeholder: string;
  onSubmit: (message: string) => void;
}

const FeedbackInput = ({ placeholder }: FeedbackInputProps) => {
  const [message, setMessage] = useState("");
  const handleChange = (e: ChangeEvent<HTMLInputElement>) =>
    setMessage(e.target.value);

  return (
    <Input
      value={message}
      placeholder={placeholder}
      fullWidth
      onChange={handleChange}
    />
  );
};

export default MetabotFeedback;
