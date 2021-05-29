import React from "react";
import PropTypes from "prop-types";
import { color } from "metabase/lib/colors";
import { t } from "ttag";
import cx from "classnames";

import Button from "metabase/components/Button";

import FilterOptions from "./FilterOptions";
import { getOperator as datePickerOperator } from "../filters/pickers/DatePicker";

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

  const buttonText = isNew ? t`Add filter` : t`Update filter`;

  const style = isSidebar
    ? {}
    : {
        background: "white",
        position: "absolute",
        bottom: 0,
        borderTop: `1px solid ${color("border")}`,
        boxSizing: "border-box",
        borderBottomRightRadius: 6,
        borderBottomLeftRadius: 6,
        paddingTop: 8,
        width: "calc(100% - 2px)",
        // Without zIndex, calendar days, if selected, scroll above this component
        zIndex: 1,
      };

  return (
    <div className={cx(className, "flex align-center")} style={style}>
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

FilterPopoverFooter.propTypes = {
  filter: PropTypes.object,
  isNew: PropTypes.bool,
  isSidebar: PropTypes.bool,
  onFilterChange: PropTypes.func,
  onCommit: PropTypes.func,
  className: PropTypes.string,
};
