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
      onClick={(e) => {
        e.preventDefault();
        onToggleRawTable(!isShowingRawTable);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleRawTable(!isShowingRawTable);
        }
      }}
      tabIndex={0}
      value={isShowingRawTable ? "data" : "visualization"}
      data-testid="query-display-tabular-toggle"
      data={[
        {
          disabled: true,
          value: "data",
          label: (
            <Icon size={16} name="table2" aria-label={t`Switch to data`} />
          ),
        },
        {
          disabled: true,
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
