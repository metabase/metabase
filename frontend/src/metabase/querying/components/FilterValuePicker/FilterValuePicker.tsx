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
  isKey,
  canListFieldValues,
  canSearchFieldValues,
} from "./utils";

interface FilterValuePickerProps<T> {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: T[];
  isCompact?: boolean;
  onChange: (newValues: T[]) => void;
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
  isCompact = false,
  shouldCreate,
  onChange,
}: FilterValuePickerOwnProps) {
  const fieldInfo = useMemo(
    () => Lib.fieldValuesInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const { data: fieldData, isLoading } = useFieldValuesQuery({
    id: fieldInfo.fieldId ?? undefined,
    enabled: canLoadFieldValues(fieldInfo),
  });

  if (isLoading) {
    return (
      <Center h="2.5rem">
        <Loader />
      </Center>
    );
  }

  if (fieldData && canListFieldValues(fieldData, isCompact)) {
    return (
      <ListValuePicker
        fieldValues={fieldData.values}
        selectedValues={selectedValues}
        placeholder={t`Search the list`}
        isCompact={isCompact}
        onChange={onChange}
      />
    );
  }

  if (canSearchFieldValues(fieldInfo)) {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);

    return (
      <SearchValuePicker
        fieldId={checkNotNull(fieldInfo.fieldId)}
        searchFieldId={checkNotNull(fieldInfo.searchFieldId)}
        fieldValues={fieldData?.values ?? []}
        selectedValues={selectedValues}
        placeholder={t`Search by ${columnInfo.displayName}`}
        shouldCreate={shouldCreate}
        onChange={onChange}
      />
    );
  }

  return (
    <StaticValuePicker
      fieldValues={fieldData?.values ?? []}
      selectedValues={selectedValues}
      placeholder={placeholder}
      shouldCreate={shouldCreate}
      onChange={onChange}
    />
  );
}

export function StringFilterValuePicker({
  query,
  stageIndex,
  column,
  values,
  isCompact,
  onChange,
}: FilterValuePickerProps<string>) {
  return (
    <FilterValuePicker
      query={query}
      stageIndex={stageIndex}
      column={column}
      values={values}
      placeholder={isKey(column) ? t`Enter an ID` : t`Enter some text`}
      isCompact={isCompact}
      shouldCreate={query => query.length > 0}
      onChange={onChange}
    />
  );
}

export function NumberFilterValuePicker({
  query,
  stageIndex,
  column,
  values,
  isCompact,
  onChange,
}: FilterValuePickerProps<number>) {
  return (
    <FilterValuePicker
      query={query}
      stageIndex={stageIndex}
      column={column}
      values={values.map(value => String(value))}
      placeholder={isKey(column) ? t`Enter an ID` : t`Enter a number`}
      isCompact={isCompact}
      shouldCreate={query => isFinite(parseFloat(query))}
      onChange={newValue => onChange(newValue.map(value => parseFloat(value)))}
    />
  );
}
