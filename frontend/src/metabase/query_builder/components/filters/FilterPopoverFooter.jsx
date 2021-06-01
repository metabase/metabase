import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import Button from "metabase/components/Button";

import FilterOptions from "./FilterOptions";
import { getOperator } from "../filters/pickers/DatePicker";

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

FilterPopoverFooter.propTypes = {
  filter: PropTypes.object,
  isNew: PropTypes.bool,
  isSidebar: PropTypes.bool,
  onFilterChange: PropTypes.func,
  onCommit: PropTypes.func,
  className: PropTypes.string,
};
