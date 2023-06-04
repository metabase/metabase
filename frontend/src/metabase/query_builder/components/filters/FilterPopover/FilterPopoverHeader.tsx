/* eslint-disable react/prop-types */
import cx from "classnames";

import Filter from "metabase-lib/queries/structured/Filter";
import OperatorSelector from "../OperatorSelector";
import SidebarHeader from "../../SidebarHeader";

type Props = {
  className?: string;

  showFieldPicker?: boolean;
  forceShowOperatorSelector?: boolean;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  onBack: () => void;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function FilterPopoverHeader({
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
      className={cx(className, "text-medium p1 mb1 border-bottom", {
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
