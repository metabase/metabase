import { useMemo } from "react";

import { FormSelect } from "metabase/forms";
import * as Lib from "metabase-lib";

type KeysetColumnSelectProps = {
  name: string;
  label: string;
  placeholder: string;
  description: string;
  query: Lib.Query;
};

export function KeysetColumnSelect({
  name,
  label,
  placeholder,
  description,
  query,
}: KeysetColumnSelectProps) {
  const columnOptions = useMemo((): Array<{ value: string; label: string }> => {
    if (!query) {
      return [];
    }

    try {
      // Use -1 to get the last stage
      const stageIndex = -1;

      // Get returned columns and filterable columns
      const returnedColumns = Lib.returnedColumns(query, stageIndex);
      const filterableColumns = Lib.filterableColumns(query, stageIndex);

      // Create a set of filterable column identifiers using display info
      const filterableIdentifiers = new Set(
        filterableColumns.map((col) => {
          const info = Lib.displayInfo(query, stageIndex, col);
          return `${info.table?.name ?? "no-table"}:${info.name}`;
        }),
      );

      // Filter returned columns to only those that are also filterable and numeric
      const numericFilterableColumns = returnedColumns.filter((column) => {
        const info = Lib.displayInfo(query, stageIndex, column);
        const identifier = `${info.table?.name ?? "no-table"}:${info.name}`;
        return filterableIdentifiers.has(identifier) && Lib.isNumeric(column);
      });

      // Convert to select options with unique keys
      const seenKeys = new Set<string>();
      const uniqueColumns: Array<{ value: string; label: string }> = [];

      numericFilterableColumns.forEach((column) => {
        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        const uniqueKey = Lib.columnUniqueKey(column);

        // Only add if we haven't seen this key before
        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);

          // Use table name + column name for the label to handle duplicates
          const label = columnInfo.table?.displayName
            ? `${columnInfo.table.displayName} → ${columnInfo.displayName}`
            : columnInfo.displayName;

          uniqueColumns.push({ value: uniqueKey, label });
        }
      });

      return uniqueColumns;
    } catch (error) {
      // If we can't extract columns (e.g., invalid query), return empty array
      console.error(
        "KeysetColumnSelect: Error extracting columns from query:",
        error,
      );
      return [];
    }
  }, [query]);

  return (
    <FormSelect
      name={name}
      label={label}
      placeholder={placeholder}
      description={description}
      data={columnOptions}
      searchable
    />
  );
}
