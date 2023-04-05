import React from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import { getIconForVisualizationType } from "metabase/visualizations";
import Question from "metabase-lib/Question";
import { Well, ToggleIcon } from "./QuestionTableToggle.styled";

interface QuestionTableToggleProps {
  className?: string;
  question: Question;
  isShowingRawTable: boolean;
  onToggleRawTable: (isShowingRawTable: boolean) => void;
}

const QuestionTableToggle = ({
  className,
  question,
  isShowingRawTable,
  onToggleRawTable,
}: QuestionTableToggleProps) => {
  const vizIcon = getIconForVisualizationType(question.display());
  return (
    <Well
      className={className}
      onClick={() => onToggleRawTable(!isShowingRawTable)}
    >
      <ToggleIcon active={isShowingRawTable} aria-label={t`Switch to data`}>
        <Icon name="table2" />
      </ToggleIcon>
      <ToggleIcon
        active={!isShowingRawTable}
        aria-label={t`Switch to visualization`}
      >
        <Icon name={vizIcon} />
      </ToggleIcon>
    </Well>
  );
};

export default QuestionTableToggle;
