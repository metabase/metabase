import cx from "classnames";
import { t } from "ttag";

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
  const handleToggle = () => onToggleRawTable(!isShowingRawTable);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleToggle();
    }
  };

  return (
    <Flex
      className={cx(QuestionDisplayToggleS.Well, className)}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={isShowingRawTable}
      aria-label={
        isShowingRawTable ? t`Switch to visualization` : t`Switch to data`
      }
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
    </Flex>
  );
};

export { QuestionDisplayToggle };
