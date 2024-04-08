import cx from "classnames";
import { t } from "ttag";

import PopoverS from "metabase/components/Popover/Popover.module.css";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import type Filter from "metabase-lib/v1/queries/structured/Filter";

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

export function FilterPopoverFooter({
  filter,
  isNew,
  onFilterChange,
  onCommit,
  className,
}: Props) {
  const containerClassName = cx(
    className,
    CS.flex,
    CS.alignCenter,
    PopoverS.PopoverFooter,
  );
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
          className={CS.mlAuto}
          onClick={() => onCommit()}
        >
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      )}
    </div>
  );
}
