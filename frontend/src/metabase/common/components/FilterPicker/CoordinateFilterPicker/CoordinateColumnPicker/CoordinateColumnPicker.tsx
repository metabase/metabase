import { useMemo, useState } from "react";
import { checkNotNull } from "metabase/lib/types";
import { Select, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import {
  getColumnOptions,
  getColumnPlaceholder,
  getInitialOption,
} from "./utils";

interface CoordinateColumnPickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  secondColumn: Lib.ColumnMetadata | undefined;
  availableColumns: Lib.ColumnMetadata[];
  onChange: (secondColumn: Lib.ColumnMetadata) => void;
}

export function CoordinateColumnPicker({
  query,
  stageIndex,
  column,
  secondColumn,
  availableColumns,
  onChange,
}: CoordinateColumnPickerProps) {
  const options = useMemo(() => {
    return getColumnOptions(query, stageIndex, availableColumns);
  }, [query, stageIndex, availableColumns]);

  const [value, setValue] = useState(() => {
    const option = getInitialOption(query, stageIndex, options, secondColumn);
    return option?.value;
  });

  const handleChange = (value: string | null) => {
    const option = checkNotNull(options.find(option => option.value === value));
    setValue(option.value);
    onChange(option.column);
  };

  return (
    <Stack p="md" spacing="sm">
      <Select
        data={options}
        value={value}
        placeholder={getColumnPlaceholder(column)}
        onChange={handleChange}
      />
    </Stack>
  );
}
