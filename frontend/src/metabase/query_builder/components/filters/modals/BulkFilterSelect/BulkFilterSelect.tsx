import React, { useMemo } from "react";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import SelectButton from "metabase/core/components/SelectButton";

export interface BulkFilterSelectProps {
  filter: Filter;
}

const BulkFilterSelect = ({ filter }: BulkFilterSelectProps): JSX.Element => {
  const name = useMemo(() => filter.displayName(), [filter]);
  return <SelectButton>{name}</SelectButton>;
};

export default BulkFilterSelect;
