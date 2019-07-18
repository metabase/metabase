import React from "react";
import cx from "classnames";

import OperatorSelector from "../filters/OperatorSelector";
import { formatField, singularize } from "metabase/lib/formatting";
import Icon from "metabase/components/Icon";
import SidebarHeader from "../SidebarHeader";

export default function FilterPopoverHeader({
  className,
  showFieldPicker,
  filter,
  onFilterChange,
  onClearField,
}) {
  const dimension = filter.dimension();
  const field = dimension.field();

  const showOperatorSelector = !(field.isTime() || field.isDate());
  const showHeader = showFieldPicker || showOperatorSelector;

  const setOperator = operatorName => {
    if (filter.operator() !== operatorName) {
      onFilterChange(filter.setOperator(operatorName));
    }
  };

  return showHeader ? (
    <div className={cx(className, "text-medium")}>
      {showFieldPicker && (
        <SidebarHeader
          className="text-default mt1 mb2"
          title={field.displayName({ includeTable: true })}
          onBack={onClearField}
        />
      )}
      {showOperatorSelector && (
        <OperatorSelector
          operator={filter.operatorName()}
          operators={filter.operatorOptions()}
          onOperatorChange={setOperator}
        />
      )}
    </div>
  ) : null;
}
