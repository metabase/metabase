import cx from "classnames";
import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { Flex, Icon, SegmentedControl } from "metabase/ui";

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
        id: "toggle-visualization",
        perform: () => onToggleRawTable(!isShowingRawTable),
      },
    ],
    [isShowingRawTable, onToggleRawTable],
  );

  return (
    <SegmentedControl
      classNames={{
        root: cx(QuestionDisplayToggleS.Well, className),
        label: QuestionDisplayToggleS.label,
        indicator: QuestionDisplayToggleS.indicator,
      }}
      value={isShowingRawTable ? "data" : "visualization"}
      onChange={(value) => onToggleRawTable(value === "data")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleRawTable(!isShowingRawTable);
        }
      }}
      data={[
        {
          value: "data",
          label: (
            <Flex
              className={cx(QuestionDisplayToggleS.ToggleIcon, {
                [QuestionDisplayToggleS.active]: isShowingRawTable,
              })}
              aria-label={t`Switch to data`}
            >
              <Icon name="table2" />
            </Flex>
          ),
        },
        {
          value: "visualization",
          label: (
            <Flex
              className={cx(QuestionDisplayToggleS.ToggleIcon, {
                [QuestionDisplayToggleS.active]: !isShowingRawTable,
              })}
              aria-label={t`Switch to visualization`}
            >
              <Icon name="lineandbar" />
            </Flex>
          ),
        },
      ]}
      transitionDuration={0}
    />
  );
};

export { QuestionDisplayToggle };
