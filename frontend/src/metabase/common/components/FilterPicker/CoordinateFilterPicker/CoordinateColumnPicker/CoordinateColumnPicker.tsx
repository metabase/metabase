import { useMemo, useState } from "react";
import { Select, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import { getColumnOptions, getColumnPlaceholder } from "./utils";

interface CoordinateColumnPickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  availableColumns: Lib.ColumnMetadata[];
  onChange: (anotherColumn: Lib.ColumnMetadata) => void;
}

export function CoordinateColumnPicker({
  query,
  stageIndex,
  column,
  availableColumns,
  onChange,
}: CoordinateColumnPickerProps) {
  const options = useMemo(() => {
    return getColumnOptions(query, stageIndex, availableColumns);
  }, [query, stageIndex, availableColumns]);

  const [value, setValue] = useState<string | null>(null);
  const placeholder = getColumnPlaceholder(column);

  const handleChange = (value: string | null) => {
    const option = options.find(option => option.value === value);
    if (option) {
      setValue(option.value);
      onChange(option.column);
    }
  };

  return (
    <Stack p="md" spacing="sm">
      <Select
        data={options}
        value={value}
        placeholder={placeholder}
        onChange={handleChange}
      />
    </Stack>
  );
}
