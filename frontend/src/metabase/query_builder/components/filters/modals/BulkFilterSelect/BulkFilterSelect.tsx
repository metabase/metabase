import React, { useCallback, useMemo } from "react";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import SelectButton from "metabase/core/components/SelectButton";

export interface BulkFilterSelectProps {
  filter?: Filter;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterSelect = ({
  filter,
  onRemoveFilter,
}: BulkFilterSelectProps): JSX.Element => {
  const name = useMemo(() => {
    return filter?.displayName();
  }, [filter]);

  const handleRemove = useCallback(() => {
    return filter && onRemoveFilter(filter);
  }, [filter, onRemoveFilter]);

  return <SelectButton onClear={handleRemove}>{name}</SelectButton>;
};

export default BulkFilterSelect;
