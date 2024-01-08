import cx from "classnames";

import SidebarHeader from "metabase/query_builder/components/SidebarHeader";
import type Filter from "metabase-lib/queries/structured/Filter";
import OperatorSelector from "../filters/OperatorSelector";

type Props = {
  className?: string;

  showFieldPicker?: boolean;
  forceShowOperatorSelector?: boolean;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  onBack: () => void;
};

export function FilterPopoverHeader({
  className,
  showFieldPicker,
  forceShowOperatorSelector,
  filter,
  onFilterChange,
  onBack,
}: Props) {
  const dimension = filter.dimension();
  if (!dimension) {
    return null;
  }

  const field = dimension.field();
  const operator = filter.operatorName();

  const showOperatorSelector = forceShowOperatorSelector ?? !field.isBoolean();
  const showHeader = showFieldPicker || showOperatorSelector;
  const showOperatorSelectorOnOwnRow = !showFieldPicker;

  const setOperator = (operatorName: string) => {
    if (filter.operatorName() !== operatorName) {
      onFilterChange(filter.setOperator(operatorName));
    }
  };

  return showHeader ? (
    <div
      className={cx(className, "text-medium p1", {
        "flex align-center": !showOperatorSelectorOnOwnRow,
      })}
    >
      {showFieldPicker && (
        <SidebarHeader
          className={cx("text-default py1", {
            pr2: !showOperatorSelectorOnOwnRow,
          })}
          title={field.displayName({ includeTable: true })}
          onBack={onBack}
        />
      )}
      {showOperatorSelector && (
        <OperatorSelector
          className={cx("flex-no-shrink block", {
            "ml-auto": !showOperatorSelectorOnOwnRow,
            my1: showOperatorSelectorOnOwnRow,
          })}
          operator={operator}
          operators={filter.filterOperators(operator)}
          onOperatorChange={setOperator}
        />
      )}
    </div>
  ) : null;
}
