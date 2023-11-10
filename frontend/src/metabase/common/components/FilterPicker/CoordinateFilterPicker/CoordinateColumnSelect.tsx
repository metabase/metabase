import { t } from "ttag";
import * as Lib from "metabase-lib";

import { Stack, Select } from "metabase/ui";

import {
  getColumnOptions,
  getColumnIdentifier,
  findLatitudeColumns,
  findLongitudeColumns,
} from "./utils";

interface CoordinateColumnSelectProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  value: Lib.ColumnMetadata | null;
  onChange: (column: Lib.ColumnMetadata) => void;
}

export function CoordinateColumnSelect({
  query,
  stageIndex,
  column,
  value,
  onChange,
}: CoordinateColumnSelectProps) {
  const latitudeColumns = findLatitudeColumns(query, stageIndex);
  const longitudeColumns = findLongitudeColumns(query, stageIndex);

  const columnDirection = Lib.isLatitude(column) ? "latitude" : "longitude";

  if (columnDirection === "latitude" && longitudeColumns.length === 1) {
    return null;
  }

  if (columnDirection === "longitude" && latitudeColumns.length === 1) {
    return null;
  }

  const options = getColumnOptions({
    query,
    stageIndex,
    columns:
      columnDirection === "latitude" ? longitudeColumns : latitudeColumns,
  });

  const selectLabel =
    columnDirection === "latitude"
      ? t`Select longitude column`
      : t`Select latitude column`;

  const handleChange = (newValue: string) => {
    const selectedOption = options.find(option => option.value === newValue);

    if (selectedOption) {
      onChange(selectedOption.column);
    }
  };

  return (
    <Stack p="md" spacing="sm">
      <Select
        label={selectLabel}
        data={options}
        value={getColumnIdentifier(query, stageIndex, value)}
        onChange={handleChange}
      />
    </Stack>
  );
}
