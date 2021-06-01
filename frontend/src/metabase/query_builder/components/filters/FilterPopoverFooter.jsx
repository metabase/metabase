/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import cx from "classnames";
import Button from "metabase/components/Button";
import { getOperator as datePickerOperator } from "../filters/pickers/DatePicker";
import FilterOptions from "./FilterOptions";

export default function FilterPopoverFooter({
  filter,
  isNew,
  isSidebar,
  onFilterChange,
  onCommit,
  className,
}) {
  const dimension = filter.dimension();
  const field = dimension.field();

  // DatePicker uses a different set of operator objects
  // Normal operators defined in schema_metadata
  const operator = field.isDate()
    ? datePickerOperator(filter)
    : filter.operator();

  const containerClassName = cx(className, "flex align-center", {
    PopoverFooter: !isSidebar,
  });

  return (
    <div className={containerClassName}>
      <FilterOptions
        filter={filter}
        onFilterChange={onFilterChange}
        operator={operator}
      />
      {onCommit && (
        <Button
          data-ui-tag="add-filter"
          purple
          disabled={!filter.isValid()}
          ml="auto"
          onClick={onCommit}
        >
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      )}
    </div>
  );
}
