import cx from "classnames";
import { t } from "ttag";

import { Flex, Icon } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";

import QuestionDisplayToggleS from "./QuestionDisplayToggle.module.css";

export interface QuestionDisplayToggleProps {
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
    <Flex
      className={cx(QuestionDisplayToggleS.Well, className)}
      onClick={() => onToggleRawTable(!isShowingRawTable)}
    >
      <Flex
        className={cx(QuestionDisplayToggleS.ToggleIcon, {
          [QuestionDisplayToggleS.active]: isShowingRawTable,
        })}
        aria-label={t`Switch to data`}
      >
        <Icon name="table2" />
      </Flex>
      <Flex
        className={cx(QuestionDisplayToggleS.ToggleIcon, {
          [QuestionDisplayToggleS.active]: !isShowingRawTable,
        })}
        aria-label={t`Switch to visualization`}
      >
        <Icon name={vizIcon} />
      </Flex>
    </Flex>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionDisplayToggle;
