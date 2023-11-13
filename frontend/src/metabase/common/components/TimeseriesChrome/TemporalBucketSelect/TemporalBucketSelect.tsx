import { useMemo } from "react";
import { Select } from "metabase/ui";
import * as Lib from "metabase-lib";
import { getAvailableOptions, getSelectedOption } from "./utils";

interface TemporalBucketSelectProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  onChange: (newColumn: Lib.ColumnMetadata) => void;
}

export function TemporalBucketSelect({
  query,
  stageIndex,
  column,
  onChange,
}: TemporalBucketSelectProps) {
  const selectedOption = useMemo(
    () => getSelectedOption(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const handleChange = (value: string | null) => {
    const option = availableOptions.find(option => option.value === value);
    if (option != null) {
      onChange(Lib.withTemporalBucket(column, option.bucket));
    }
  };

  return (
    <Select
      value={selectedOption?.value}
      data={availableOptions}
      onChange={handleChange}
    />
  );
}
