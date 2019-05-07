import React from "react";

import FilterOptions from "./FilterOptions";

import { getOperator } from "../filters/pickers/DatePicker";

import { t } from "ttag";
import cx from "classnames";

export default function FilterPopoverFooter({
  filter,
  isNew,
  onFilterChange,
  onCommit,
  className,
}) {
  const dimension = filter.dimension();
  const field = dimension.field();
  return (
    <div className={cx(className, "flex align-center")}>
      <FilterOptions
        filter={filter}
        onFilterChange={onFilterChange}
        operator={
          field.isDate()
            ? // DatePicker uses a different set of operator objects
              getOperator(filter)
            : // Normal operators defined in schema_metadata
              filter.operator()
        }
      />
      <button
        data-ui-tag="add-filter"
        className={cx("Button Button--purple ml-auto", {
          disabled: !filter.isValid(),
        })}
        onClick={onCommit}
      >
        {isNew ? t`Add filter` : t`Update filter`}
      </button>
    </div>
  );
}
