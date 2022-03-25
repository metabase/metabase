/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import OperatorSelector from "../filters/OperatorSelector";
import SidebarHeader from "../SidebarHeader";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import DateOperatorTabs from "./DateOperatorHeader";

type Props = {
  className?: string;

  showFieldPicker?: boolean;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  onBack: () => void;
  isSidebar?: boolean;
};

export default function FilterPopoverHeader({
  className,
  showFieldPicker,
  filter,
  onFilterChange,
  onBack,
  isSidebar,
}: Props) {
  const dimension = filter.dimension();
  if (!dimension) {
    return null;
  }

  const field = dimension.field();
  const operator = filter.operatorName();

  const showOperatorSelector = !(
    field.isTime() ||
    field.isDate() ||
    field.isBoolean()
  );
  const showDateHeader = field.isTime() || field.isDate();
  const showHeader = showFieldPicker || showOperatorSelector || showDateHeader;
  const showOperatorSelectorOnOwnRow = isSidebar || !showFieldPicker;

  const setOperator = (operatorName: string) => {
    if (filter.operatorName() !== operatorName) {
      onFilterChange(filter.setOperator(operatorName));
    }
  };

  return showHeader ? (
    <div
      className={cx(className, "text-medium", {
        "flex align-center": !showOperatorSelectorOnOwnRow,
        "px1 pt1": isSidebar,
        "p1 mb1 border-bottom": !isSidebar && !showDateHeader,
        "mb1 border-bottom": showDateHeader,
      })}
    >
      {showFieldPicker && !showDateHeader && (
        <SidebarHeader
          className={cx("text-default py1", {
            pr2: !showOperatorSelectorOnOwnRow,
          })}
          title={
            (field.table ? field.table.displayName() + " – " : "") +
            field.displayName()
          }
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
      {showDateHeader && (
        <DateOperatorTabs
          filter={filter}
          onBack={onBack}
          operator={operator}
          onFilterChange={onFilterChange}
        />
      )}
    </div>
  ) : null;
}
