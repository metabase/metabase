import React, { Fragment, useCallback, useMemo, useState } from "react";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import SelectButton from "metabase/core/components/SelectButton";
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
  const [isOpened, setIsOpened] = useState(false);

  const name = useMemo(() => {
    return filter?.displayName();
  }, [filter]);

  const handleOpenPopover = useCallback(() => {
    setIsOpened(true);
  }, []);

  const handleClosePopover = useCallback(() => {
    setIsOpened(false);
  }, []);

  const handleChangeFilter = useCallback(
    (newFilter: Filter) => {
      onChangeFilter(filter, newFilter);
    },
    [filter, onChangeFilter],
  );

  const handleRemoveFilter = useCallback(() => {
    return onRemoveFilter(filter);
  }, [filter, onRemoveFilter]);

  return (
    <Fragment>
      <SelectButton onClick={handleOpenPopover} onClear={handleRemoveFilter}>
        {name}
      </SelectButton>
      {isOpened && (
        <FilterPopover
          query={query}
          filter={filter}
          isNew={false}
          showCustom={false}
          showFieldPicker={false}
          onChangeFilter={handleChangeFilter}
          onClose={handleClosePopover}
        />
      )}
    </Fragment>
  );
};

export default BulkFilterSelect;
