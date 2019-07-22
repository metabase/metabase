import React from "react";
import cx from "classnames";

import OperatorSelector from "../filters/OperatorSelector";
import SidebarHeader from "../SidebarHeader";

export default function FilterPopoverHeader({
  className,
  showFieldPicker,
  filter,
  onFilterChange,
  isSidebar,
}) {
  const dimension = filter.dimension();
  const field = dimension.field();

  const showOperatorSelector = !(field.isTime() || field.isDate());
  const showHeader = showFieldPicker || showOperatorSelector;
  const showOperatorSelectorOnOwnRow = isSidebar || !showFieldPicker;

  const setOperator = operatorName => {
    if (filter.operator() !== operatorName) {
      onFilterChange(filter.setOperator(operatorName));
    }
  };
  const clearField = () => onFilterChange(null);

  return showHeader ? (
    <div
      className={cx(className, "text-medium", {
        "flex align-center": !showOperatorSelectorOnOwnRow,
      })}
    >
      {showFieldPicker && (
        <SidebarHeader
          className={cx("text-default py1")}
          title={
            (field.table ? field.table.displayName() + " – " : "") +
            field.displayName()
          }
          onBack={clearField}
        />
      )}
      {showOperatorSelector && (
        <OperatorSelector
          className={cx("flex-no-shrink block", {
            "ml-auto": !showOperatorSelectorOnOwnRow,
            my1: showOperatorSelectorOnOwnRow,
          })}
          operator={filter.operatorName()}
          operators={filter.operatorOptions()}
          onOperatorChange={setOperator}
        />
      )}
    </div>
  ) : null;
}
