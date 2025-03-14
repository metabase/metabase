import cx from "classnames";
import { t } from "ttag";

import ViewButton from "metabase/query_builder/components/view/ViewButton";
import { Flex, Icon } from "metabase/ui";

import QuestionDisplayToggleS from "./QuestionDisplayToggle.module.css";

export interface QuestionDisplayToggleProps {
  className?: string;
  isShowingRawTable: boolean;
  onToggleRawTable: (isShowingRawTable: boolean) => void;
}

const QuestionDisplayToggle = ({
  className,
  isShowingRawTable,
  onToggleRawTable,
}: QuestionDisplayToggleProps) => {
  return (
    <ViewButton
      className={cx(QuestionDisplayToggleS.Well, className)}
      medium
      labelBreakpoint="sm"
      color="grey"
      data-testid="viz-toggle-button"
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
        <Icon name="lineandbar" />
      </Flex>
    </ViewButton>
  );
};

export { QuestionDisplayToggle };
