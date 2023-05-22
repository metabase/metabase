import React from "react";
import { t } from "ttag";
import cx from "classnames";

import Button from "metabase/core/components/Button";

import Filter from "metabase-lib/queries/structured/Filter";
import FilterOptions from "./FilterOptions";

type Props = {
  className?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  onCommit?: (() => void) | null;

  minWidth?: number;
  maxWidth?: number;
  isNew?: boolean;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function FilterPopoverFooter({
  filter,
  isNew,
  onFilterChange,
  onCommit,
  className,
}: Props) {
  const containerClassName = cx(className, "flex align-center PopoverFooter");
  return (
    <div className={containerClassName}>
      <FilterOptions
        filter={filter}
        onFilterChange={onFilterChange}
        operator={filter.operator()}
      />
      {onCommit && (
        <Button
          data-ui-tag="add-filter"
          primary
          disabled={!filter.isValid()}
          ml="auto"
          onClick={() => onCommit()}
        >
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      )}
    </div>
  );
}
