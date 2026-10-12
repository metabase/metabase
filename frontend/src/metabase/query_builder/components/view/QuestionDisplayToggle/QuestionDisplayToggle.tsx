import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { SegmentedControl } from "metabase/ui";

export interface QuestionDisplayToggleProps {
  className?: string;
  isShowingRawTable: boolean;
  onToggleRawTable: (isShowingRawTable: boolean) => void;
}

export const QuestionDisplayToggle = ({
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
    <SegmentedControl
      classNames={{
        root: className,
      }}
      onChange={() => {
        onToggleRawTable(!isShowingRawTable);
      }}
      value={isShowingRawTable ? "data" : "visualization"}
      data-testid="query-display-tabular-toggle"
      data={[
        {
          value: "data",
          ariaLabel: t`Switch to data`,
          icon: "table2",
        },
        {
          value: "visualization",
          ariaLabel: t`Switch to visualization`,
          icon: "lineandbar",
        },
      ]}
    />
  );
};
