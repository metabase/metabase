import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import Button from "metabase/components/Button";

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

  const showFooter = !field.isDate();

  const containerClassName = cx(className, "flex align-center", {
    PopoverFooter: !isSidebar,
  });

  return showFooter ? (
    <div className={containerClassName}>
      <FilterOptions
        filter={filter}
        onFilterChange={onFilterChange}
        operator={filter.operator()}
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
  ) : null;
}

FilterPopoverFooter.propTypes = {
  filter: PropTypes.object,
  isNew: PropTypes.bool,
  isSidebar: PropTypes.bool,
  onFilterChange: PropTypes.func,
  onCommit: PropTypes.func,
  className: PropTypes.string,
};
