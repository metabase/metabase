import { useMemo } from "react";

import { FormSelect } from "metabase/forms";
import {
  type DataAttributes,
  type InputDescriptionProps,
  Loader,
  type SelectOption,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { useAutoSelectFirstOption } from "../useAutoSelectFirstOption";

/**
 * Get filterable numeric/temporal field options from the source table of a query.
 * Returns SelectOption[] with field IDs as string values.
 */
export function getSourceFieldOptions(
  query: Lib.Query,
  opts?: { labelPrefix?: string; seenFieldIds?: Set<number> },
): Array<SelectOption> {
  // Stage 0 is the source stage (raw table data). Keyset pagination requires columns from the
  // actual source table; later stages may have aggregations, joins, or expressions instead.
  const stageIndex = 0;
  const filterableColumns = Lib.filterableColumns(query, stageIndex);

  const groups = Lib.groupColumns(filterableColumns);
  const sourceGroup = groups.find((group) => {
    const groupInfo = Lib.displayInfo(query, stageIndex, group);
    return groupInfo.isSourceTable;
  });

  if (!sourceGroup) {
    return [];
  }

  const sourceColumns = Lib.getColumnsFromColumnGroup(sourceGroup);
  const seenFieldIds = opts?.seenFieldIds ?? new Set<number>();
  const options: Array<SelectOption> = [];

  for (const column of sourceColumns) {
    if (!Lib.isNumeric(column) && !Lib.isTemporal(column)) {
      continue;
    }

    const { fieldId } = Lib.fieldValuesSearchInfo(query, column);
    if (fieldId == null || seenFieldIds.has(fieldId)) {
      continue;
    }

    seenFieldIds.add(fieldId);

    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    const label = opts?.labelPrefix
      ? `${opts.labelPrefix}: ${columnInfo.displayName}`
      : columnInfo.longDisplayName;

    options.push({ value: String(fieldId), label });
  }

  return options;
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
      return getSourceFieldOptions(query);
    } catch (error) {
      console.error(
        "KeysetColumnSelect: Error extracting columns from query:",
        error,
      );
      return [];
    }
  }, [query]);

  useAutoSelectFirstOption({
    name,
    options: columnOptions,
    disabled: disabled || isLoading,
  });

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
