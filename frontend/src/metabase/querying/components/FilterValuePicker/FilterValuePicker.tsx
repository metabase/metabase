import { useMemo } from "react";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import { Loader, Center } from "metabase/ui";
import { useFieldValuesQuery } from "metabase/common/hooks";
import { ListValuePicker } from "./ListValuePicker";
import { SearchValuePicker } from "./SearchValuePicker";
import { SelectValuePicker } from "./SelectValuePicker";
import { MAX_INLINE_OPTIONS } from "./constants";
import { isKey } from "./utils";

interface FilterValuePickerProps<T> {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  value: T[];
  compact?: boolean;
  onChange: (newValue: T[]) => void;
}

interface FilterValuePickerOwnProps extends FilterValuePickerProps<string> {
  placeholder: string;
  shouldCreate: (query: string) => boolean;
}

function FilterValuePicker({
  query,
  stageIndex,
  column,
  value,
  placeholder,
  compact,
  shouldCreate,
  onChange,
}: FilterValuePickerOwnProps) {
  const { fieldId, hasFieldValues } = useMemo(
    () => Lib.fieldValuesInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const { data = [], isLoading } = useFieldValuesQuery({
    id: fieldId != null ? fieldId : undefined,
    enabled: hasFieldValues === "list",
  });

  if (isLoading) {
    return (
      <Center h="2.5rem">
        <Loader />
      </Center>
    );
  }

  if (data.length > 0 && (data.length <= MAX_INLINE_OPTIONS || !compact)) {
    return (
      <ListValuePicker
        data={data}
        value={value}
        placeholder={t`Search the list`}
        compact={compact}
        onChange={onChange}
      />
    );
  }

  if (fieldId != null && hasFieldValues === "search") {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);

    return (
      <SearchValuePicker
        fieldId={fieldId}
        value={value}
        placeholder={t`Search by ${columnInfo.displayName}`}
        shouldCreate={shouldCreate}
        onChange={onChange}
      />
    );
  }

  return (
    <SelectValuePicker
      data={data}
      value={value}
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
  value,
  compact,
  onChange,
}: FilterValuePickerProps<string>) {
  return (
    <FilterValuePicker
      query={query}
      stageIndex={stageIndex}
      column={column}
      value={value}
      placeholder={isKey(column) ? t`Enter an ID` : t`Enter some text`}
      compact={compact}
      shouldCreate={query => query.length > 0}
      onChange={onChange}
    />
  );
}

export function NumberFilterValuePicker({
  query,
  stageIndex,
  column,
  value,
  compact,
  onChange,
}: FilterValuePickerProps<number>) {
  return (
    <FilterValuePicker
      query={query}
      stageIndex={stageIndex}
      column={column}
      value={value.map(value => String(value))}
      placeholder={isKey(column) ? t`Enter an ID` : t`Enter a number`}
      compact={compact}
      shouldCreate={query => isFinite(parseFloat(query))}
      onChange={newValue => onChange(newValue.map(value => parseFloat(value)))}
    />
  );
}
