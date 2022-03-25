import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import Button from "metabase/core/components/Button";

import FilterOptions from "./FilterOptions";
import { getOperator } from "../filters/pickers/DatePicker";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import DateOperatorFooter from "./DateOperatorFooter";

export function shouldHidePopoverFooter(filter: Filter): boolean {
  const [op, _, value] = filter;
  if (op === "time-interval" && value === "current") {
    return true;
  }
  return false;
}

type Props = {
  className?: string;
  primaryColor?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  onCommit?: (() => void) | null;
  // toggleTimeSelectors: () => void;
  isSidebar?: boolean;
  minWidth?: number;
  maxWidth?: number;
  isNew?: boolean;
};

export default function FilterPopoverFooter({
  filter,
  isNew,
  isSidebar,
  onFilterChange,
  onCommit,
  className,
  primaryColor,
}: // toggleTimeSelectors,
Props) {
  if (shouldHidePopoverFooter(filter)) {
    return null;
  }

  const dimension = filter.dimension();
  const field = dimension?.field();

  const containerClassName = cx(className, "flex align-center", {
    PopoverFooter: !isSidebar,
  });

  return (
    <div className={containerClassName}>
      <FilterOptions
        filter={filter}
        onFilterChange={onFilterChange}
        operator={
          field?.isDate()
            ? // DatePicker uses a different set of operator objects
              getOperator(filter)
            : // Normal operators defined in schema_metadata
              filter.operator()
        }
      />
      <DateOperatorFooter
        filter={filter}
        onFilterChange={onFilterChange}
        primaryColor={primaryColor}
      />
      {onCommit && (
        <Button
          data-ui-tag="add-filter"
          purple
          style={{ backgroundColor: primaryColor }}
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
