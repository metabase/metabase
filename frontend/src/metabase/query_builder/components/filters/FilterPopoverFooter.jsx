/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";
import cx from "classnames";

import Button from "metabase/components/Button";

import FilterOptions from "./FilterOptions";
import { getOperator as datePickerOperator } from "../filters/pickers/DatePicker";

export default function FilterPopoverFooter({
  filter,
  isNew,
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

  const buttonText = isNew ? t`Add filter` : t`Update filter`;

  return (
    <div
      className={cx(className, "flex align-center")}
      style={{
        background: "white",
        position: "absolute",
        bottom: 0,
        borderTop: "1px solid #f0f0f0",
        boxSizing: "border-box",
        borderBottomRightRadius: "6px",
        borderBottomLeftRadius: "6px",
        paddingTop: 8,
        width: "calc(100% - 2px)",
      }}
    >
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
          {buttonText}
        </Button>
      )}
    </div>
  );
}
