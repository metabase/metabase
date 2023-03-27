import React from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { MetabotFeedbackType } from "metabase-types/api";
import MetabotMessage from "../MetabotMessage";
import { FeedbackSelectionRoot } from "./MetabotFeedback.styled";

export interface MetabotFeedbackProps {
  type?: MetabotFeedbackType;
  onTypeChange: (newType: MetabotFeedbackType) => void;
}

const MetabotFeedback = ({ type, onTypeChange }: MetabotFeedbackProps) => {
  switch (type) {
    case "great":
      return <GreatFeedbackMessage />;
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

export default MetabotFeedback;
