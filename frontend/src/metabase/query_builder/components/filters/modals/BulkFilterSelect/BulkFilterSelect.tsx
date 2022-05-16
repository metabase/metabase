import React, { Fragment, useCallback, useMemo, useState } from "react";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import SelectButton from "metabase/core/components/SelectButton";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import FilterPopover from "../../FilterPopover";

export interface BulkFilterSelectProps {
  query: StructuredQuery;
  filter: Filter;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterSelect = ({
  query,
  filter,
  onChangeFilter,
  onRemoveFilter,
}: BulkFilterSelectProps): JSX.Element => {
  const name = useMemo(() => {
    return filter?.displayName();
  }, [filter]);

  const handleChange = useCallback(
    (newFilter: Filter) => {
      onChangeFilter(filter, newFilter);
    },
    [filter, onChangeFilter],
  );

  const handleClear = useCallback(() => {
    return onRemoveFilter(filter);
  }, [filter, onRemoveFilter]);

  return (
    <TippyPopoverWithTrigger
      placement="bottom"
      renderTrigger={({ onClick }) => (
        <SelectButton onClick={onClick} onClear={handleClear}>
          {name}
        </SelectButton>
      )}
      popoverContent={({ closePopover }) => (
        <FilterPopover
          query={query}
          filter={filter}
          isNew={false}
          showCustom={false}
          showFieldPicker={false}
          onChangeFilter={handleChange}
          onClose={closePopover}
        />
      )}
    />
  );
};

export default BulkFilterSelect;
