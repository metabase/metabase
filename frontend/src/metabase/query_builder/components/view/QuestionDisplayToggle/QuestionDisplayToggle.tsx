import { t } from "ttag";

import { Icon } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";

import { Well, ToggleIcon } from "./QuestionDisplayToggle.styled";

interface QuestionDisplayToggleProps {
  className?: string;
  question: Question;
  isShowingRawTable: boolean;
  onToggleRawTable: (isShowingRawTable: boolean) => void;
}

const QuestionDisplayToggle = ({
  className,
  question,
  isShowingRawTable,
  onToggleRawTable,
}: QuestionDisplayToggleProps) => {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionDisplayToggle;
