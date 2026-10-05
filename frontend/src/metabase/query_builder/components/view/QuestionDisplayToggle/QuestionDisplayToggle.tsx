import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { Icon, SegmentedControl } from "metabase/ui";

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
          label: (
            <Icon size={16} name="table2" aria-label={t`Switch to data`} />
          ),
        },
        {
          value: "visualization",
          label: (
            <Icon
              size={16}
              name="lineandbar"
              aria-label={t`Switch to visualization`}
            />
          ),
        },
      ]}
    />
  );
};
