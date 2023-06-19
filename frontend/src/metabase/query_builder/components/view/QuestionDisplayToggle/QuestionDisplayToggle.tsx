import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { getIconForVisualizationType } from "metabase/visualizations";
import Question from "metabase-lib/Question";
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
