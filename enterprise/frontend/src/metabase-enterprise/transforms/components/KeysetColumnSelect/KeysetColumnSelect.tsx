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

      // Get the filterable columns from the query
      const filterableColumns = Lib.filterableColumns(query, stageIndex);

      // Filter to only numeric columns
      const numericColumns = filterableColumns.filter((column) =>
        Lib.isNumeric(column),
      );

      // Convert to select options
      return numericColumns.map((column) => {
        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        // Get the field ref for this column
        const fieldRef = Lib.ref(column);

        // Use table name + column name for the label to handle duplicates
        const label = columnInfo.table?.displayName
          ? `${columnInfo.table.displayName} → ${columnInfo.displayName}`
          : columnInfo.displayName;

        return {
          // Use the stringified field ref as the value
          value: JSON.stringify(fieldRef),
          label,
        };
      });
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
