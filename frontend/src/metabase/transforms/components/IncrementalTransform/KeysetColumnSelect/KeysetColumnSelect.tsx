import { useMemo } from "react";

import { FormSelect } from "metabase/forms";
import type {
  DataAttributes,
  InputDescriptionProps,
  SelectOption,
} from "metabase/ui";
import * as Lib from "metabase-lib";

type KeysetColumnSelectProps = {
  name: string;
  label: string;
  placeholder: string;
  description: React.ReactNode;
  descriptionProps?: InputDescriptionProps & DataAttributes;
  query: Lib.Query | null;
  disabled?: boolean;
};

export function KeysetColumnSelect({
  name,
  label,
  placeholder,
  description,
  descriptionProps,
  query,
  disabled,
}: KeysetColumnSelectProps) {
  const columnOptions = useMemo((): Array<SelectOption> => {
    if (!query) {
      return [];
    }

    try {
      // Use -1 to get the last stage
      const stageIndex = -1;

      const returnedColumns = Lib.returnedColumns(query, stageIndex);
      const filterableColumns = Lib.filterableColumns(query, stageIndex);

      const filterableIdentifiers = new Set(
        filterableColumns.map((col) => {
          return Lib.columnKey(col);
        }),
      );

      const numericFilterableColumns = returnedColumns.filter((column) => {
        return (
          filterableIdentifiers.has(Lib.columnKey(column)) &&
          (Lib.isNumeric(column) || Lib.isTemporal(column))
        );
      });

      // Convert to select options with unique keys
      const seenKeys = new Set<string>();
      const uniqueColumns: Array<SelectOption> = [];

      numericFilterableColumns.forEach((column) => {
        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        const uniqueKey = Lib.columnUniqueKey(column);

        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);

          const label = columnInfo.longDisplayName;

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
      disabled={disabled || columnOptions.length === 0}
      descriptionProps={descriptionProps}
    />
  );
}
