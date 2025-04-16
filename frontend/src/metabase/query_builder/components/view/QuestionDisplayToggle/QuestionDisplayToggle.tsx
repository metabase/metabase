import cx from "classnames";
import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
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
  useRegisterShortcut(
    [
      {
        id: "query-builder-toggle-visualization",
        perform: () => onToggleRawTable(!isShowingRawTable),
      },
    ],
    [isShowingRawTable, onToggleRawTable],
  );

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
        <Icon name="lineandbar" />
      </Flex>
    </Flex>
  );
};

export { QuestionDisplayToggle };
