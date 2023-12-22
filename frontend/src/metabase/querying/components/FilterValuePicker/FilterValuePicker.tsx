import type { FocusEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import { checkNotNull } from "metabase/lib/types";
import { Loader, Center } from "metabase/ui";
import { useFieldValuesQuery } from "metabase/common/hooks";
import { ListValuePicker } from "./ListValuePicker";
import { SearchValuePicker } from "./SearchValuePicker";
import { StaticValuePicker } from "./StaticValuePicker";
import {
  canLoadFieldValues,
  isKeyColumn,
  canListFieldValues,
  canSearchFieldValues,
} from "./utils";

interface FilterValuePickerProps<T> {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: T[];
  autoFocus?: boolean;
  compact?: boolean;
  onChange: (newValues: T[]) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

interface FilterValuePickerOwnProps extends FilterValuePickerProps<string> {
  placeholder: string;
  shouldCreate: (query: string) => boolean;
}

function FilterValuePicker({
  query,
  stageIndex,
  column,
  values: selectedValues,
  placeholder,
  autoFocus = false,
  compact = false,
  shouldCreate,
  onChange,
  onFocus,
  onBlur,
}: FilterValuePickerOwnProps) {
  const fieldInfo = useMemo(
    () => Lib.fieldValuesSearchInfo(query, column),
    [query, column],
  );

  const { data: fieldData, isLoading } = useFieldValuesQuery({
    id: fieldInfo.fieldId ?? undefined,
    enabled: canLoadFieldValues(fieldInfo),
  });

  const fieldValues = fieldData?.values ?? [];

  if (isLoading) {
    return (
      <Center h="2.5rem">
        <Loader />
      </Center>
    );
  }

  if (fieldData && canListFieldValues(fieldData, compact)) {
    return (
      <ListValuePicker
        fieldValues={fieldData.values}
        selectedValues={selectedValues}
        placeholder={t`Search the list`}
        shouldCreate={shouldCreate}
        autoFocus={autoFocus}
        compact={compact}
        onChange={onChange}
      />
    );
  }

  if (canSearchFieldValues(fieldInfo, fieldData)) {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);

    return (
      <SearchValuePicker
        fieldId={checkNotNull(fieldInfo.fieldId)}
        searchFieldId={checkNotNull(fieldInfo.searchFieldId)}
        fieldValues={fieldValues}
        selectedValues={selectedValues}
        placeholder={t`Search by ${columnInfo.displayName}`}
        shouldCreate={shouldCreate}
        autoFocus={autoFocus}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  }

  return (
    <StaticValuePicker
      fieldValues={fieldValues}
      selectedValues={selectedValues}
      placeholder={fieldValues.length > 0 ? t`Search the list` : placeholder}
      shouldCreate={shouldCreate}
      autoFocus={autoFocus}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}

export function StringFilterValuePicker({
  column,
  values,
  ...props
}: FilterValuePickerProps<string>) {
  return (
    <FilterValuePicker
      {...props}
      column={column}
      values={values}
      placeholder={isKeyColumn(column) ? t`Enter an ID` : t`Enter some text`}
      shouldCreate={query => query.length > 0}
    />
  );
}

export function NumberFilterValuePicker({
  column,
  values,
  onChange,
  ...props
}: FilterValuePickerProps<number>) {
  return (
    <FilterValuePicker
      {...props}
      column={column}
      values={values.map(value => String(value))}
      placeholder={isKeyColumn(column) ? t`Enter an ID` : t`Enter a number`}
      shouldCreate={query => isFinite(parseFloat(query))}
      onChange={newValue => onChange(newValue.map(value => parseFloat(value)))}
    />
  );
}
