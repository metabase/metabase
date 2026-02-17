import { useMemo } from "react";

import { FormSelect } from "metabase/forms";
import {
  type DataAttributes,
  type InputDescriptionProps,
  Loader,
  type SelectOption,
} from "metabase/ui";
import * as Lib from "metabase-lib";

/**
 * Extract the field ID from a column using the legacy field reference.
 * Returns null if the column doesn't have a concrete field ID (e.g., derived columns).
 */
function extractFieldId(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): number | null {
  try {
    const legacyRef = Lib.legacyRef(query, stageIndex, column);
    // Legacy field reference format: ["field", fieldId, options]
    // We only want concrete field IDs (numbers), not string names
    if (
      Array.isArray(legacyRef) &&
      legacyRef[0] === "field" &&
      typeof legacyRef[1] === "number"
    ) {
      return legacyRef[1];
    }
    return null;
  } catch {
    return null;
  }
}

type KeysetColumnSelectProps = {
  name: string;
  label: string;
  placeholder: string;
  description: React.ReactNode;
  descriptionProps?: InputDescriptionProps & DataAttributes;
  query: Lib.Query | null;
  disabled?: boolean;
  isLoading?: boolean;
};

export function KeysetColumnSelect({
  name,
  label,
  placeholder,
  description,
  descriptionProps,
  query,
  disabled,
  isLoading,
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

      // Convert to select options with field IDs
      // Only include columns that have concrete field IDs (excludes derived/computed columns)
      const seenFieldIds = new Set<number>();
      const uniqueColumns: Array<SelectOption> = [];

      numericFilterableColumns.forEach((column) => {
        const fieldId = extractFieldId(query, stageIndex, column);

        // Skip derived/computed columns that don't have field IDs
        if (fieldId == null) {
          return;
        }

        // Skip duplicates (can happen with joins)
        if (seenFieldIds.has(fieldId)) {
          return;
        }

        seenFieldIds.add(fieldId);

        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        const label = columnInfo.longDisplayName;

        // Mantine Select requires string values, so convert field ID to string
        uniqueColumns.push({ value: String(fieldId), label });
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
      rightSection={isLoading ? <Loader size="xs" /> : undefined}
    />
  );
}
