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

const MetabotFeedback = ({ onTypeChange }: MetabotFeedbackProps) => {
  return <FeedbackSelection onTypeChange={onTypeChange} />;
};

interface FeedbackSelectionProps {
  onTypeChange: (newType: MetabotFeedbackType) => void;
}

const FeedbackSelection = ({ onTypeChange }: FeedbackSelectionProps) => {
  return (
    <FeedbackSelectionRoot>
      <MetabotMessage>{t`How did I do?`}</MetabotMessage>
      <Button onClick={() => onTypeChange("great")}>{t`This is great!`}</Button>
      <Button onClick={() => onTypeChange("wrong-data")}>
        {t`This used the wrong data.`}
      </Button>
      <Button onClick={() => onTypeChange("incorrect-result")}>
        {t`This result isn’t correct.`}
      </Button>
      <Button onClick={() => onTypeChange("invalid-sql")}>
        {t`This isn’t valid SQL.`}
      </Button>
    </FeedbackSelectionRoot>
  );
};

export default MetabotFeedback;
