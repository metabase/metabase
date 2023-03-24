import React from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import { getIconForVisualizationType } from "metabase/visualizations";
import Question from "metabase-lib/Question";
import { Well, ToggleIcon } from "./QuestionTableToggle.styled";

interface QuestionTableToggleProps {
  className?: string;
  question: Question;
  isRawTable: boolean;
  onToggleRawTable: (isRawTable: boolean) => void;
}

const QuestionTableToggle = ({
  className,
  question,
  isRawTable,
  onToggleRawTable,
}: QuestionTableToggleProps) => {
  const vizIcon = getIconForVisualizationType(question.display());
  return (
    <Well className={className} onClick={() => onToggleRawTable(!isRawTable)}>
      <ToggleIcon active={isRawTable} aria-label={t`Switch to data`}>
        <Icon name="table2" />
      </ToggleIcon>
      <ToggleIcon active={!isRawTable} aria-label={t`Switch to visualization`}>
        <Icon name={vizIcon} />
      </ToggleIcon>
    </Well>
  );
};

export default QuestionTableToggle;
