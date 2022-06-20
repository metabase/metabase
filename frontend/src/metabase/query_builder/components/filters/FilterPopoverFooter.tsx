import React from "react";
import { t } from "ttag";
import cx from "classnames";

import Button from "metabase/core/components/Button";

import FilterOptions from "./FilterOptions";
import Filter from "metabase-lib/lib/queries/structured/Filter";

type Props = {
  className?: string;
  primaryColor?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  onCommit?: (() => void) | null;

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
}: Props) {
  const containerClassName = cx(className, "flex align-center", {
    PopoverFooter: !isSidebar,
  });

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
          purple
          style={{ backgroundColor: primaryColor }}
          disabled={!filter.isValid()}
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          ml="auto"
          onClick={() => onCommit()}
        >
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      )}
    </div>
  );
}
