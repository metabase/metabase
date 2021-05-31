import { t } from "ttag";
import PropTypes from "prop-types";
import cx from "classnames";
import Button from "metabase/components/Button";
import React from "react";
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

  const buttonText = isNew ? t`Add filter` : t`Update filter`;
  const isButtonDisabled = !filter.isValid();

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
          disabled={isButtonDisabled}
          ml="auto"
          onClick={onCommit}
        >
          {buttonText}
        </Button>
      )}
    </div>
  );
}

FilterPopoverFooter.propTypes = {
  filter: PropTypes.object,
  isNew: PropTypes.bool,
  isSidebar: PropTypes.bool,
  onFilterChange: PropTypes.func,
  onCommit: PropTypes.func,
  className: PropTypes.string,
};
