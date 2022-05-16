import React, { useCallback, useMemo } from "react";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Dimension, { FieldDimension } from "metabase-lib/lib/Dimension";
import SelectButton from "metabase/core/components/SelectButton";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { FilterPopoverWithOverflow } from "./BulkFilterSelect.styled";

export interface BulkFilterSelectProps {
  query: StructuredQuery;
  filter?: Filter;
  dimension: Dimension;
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterSelect = ({
  query,
  filter,
  dimension,
  onAddFilter,
  onChangeFilter,
  onRemoveFilter,
}: BulkFilterSelectProps): JSX.Element => {
  const name = useMemo(() => {
    return filter?.displayName();
  }, [filter]);

  const newFilter = useMemo(() => {
    return getNewFilter(query, dimension);
  }, [query, dimension]);

  const handleChange = useCallback(
    (newFilter: Filter) => {
      if (filter) {
        onChangeFilter(filter, newFilter);
      } else {
        onAddFilter(newFilter);
      }
    },
    [filter, onAddFilter, onChangeFilter],
  );

  const handleClear = useCallback(() => {
    if (filter) {
      onRemoveFilter(filter);
    }
  }, [filter, onRemoveFilter]);

  return (
    <TippyPopoverWithTrigger
      placement="bottom"
      renderTrigger={({ onClick }) => (
        <SelectButton
          onClick={onClick}
          onClear={filter ? handleClear : undefined}
        >
          {name}&nbsp;
        </SelectButton>
      )}
      popoverContent={({ closePopover }) => (
        <FilterPopoverWithOverflow
          query={query}
          filter={filter ?? newFilter}
          isNew={filter == null}
          showCustom={false}
          showFieldPicker={false}
          onChangeFilter={handleChange}
          onClose={closePopover}
        />
      )}
    />
  );
};

const getNewFilter = (query: StructuredQuery, dimension: Dimension) => {
  const filter = new Filter([], null, query);

  return dimension instanceof FieldDimension
    ? filter.setDimension(dimension.mbql(), { useDefaultOperator: true })
    : filter;
};

export default BulkFilterSelect;
