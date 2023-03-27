import React, { useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { MetabotFeedbackType } from "metabase-types/api";
import MetabotMessage from "../MetabotMessage";
import { FeedbackSelectionRoot } from "./MetabotFeedback.styled";

export interface MetabotFeedbackProps {
  type?: MetabotFeedbackType;
  onTypeChange: (newType: MetabotFeedbackType) => void;
}

const MetabotFeedback = ({ onTypeChange }: MetabotFeedbackProps) => {
  return <FeedbackSelection onTypeChange={onTypeChange} />;
};

interface FeedbackSelectionProps {
  onTypeChange: (newType: MetabotFeedbackType) => void;
}

const FeedbackSelection = ({ onTypeChange }: FeedbackSelectionProps) => {
  const handleGreatChange = useCallback(
    () => onTypeChange("great"),
    [onTypeChange],
  );

  const handleWrongDataChange = useCallback(
    () => onTypeChange("wrong-data"),
    [onTypeChange],
  );

  const handleIncorrectResultChange = useCallback(
    () => onTypeChange("incorrect-result"),
    [onTypeChange],
  );

  const handleInvalidSqlChange = useCallback(
    () => onTypeChange("invalid-sql"),
    [onTypeChange],
  );

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

export default MetabotFeedback;
