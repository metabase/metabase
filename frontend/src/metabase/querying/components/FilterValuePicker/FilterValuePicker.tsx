import { useMemo } from "react";
import * as Lib from "metabase-lib";
import { useFieldValuesQuery } from "metabase/common/hooks";
import { SearchValuePicker } from "metabase/querying/components/FilterValuePicker/SearchValuePicker";
import { InlineValuePicker } from "./InlineValuePicker";
import { SelectValuePicker } from "./SelectValuePicker";
import { MAX_INLINE_OPTIONS } from "./constants";

interface FilterValuePickerProps<T> {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  value: T[];
  placeholder?: string;
  compact?: boolean;
  getCreateLabel?: (query: string) => string | null;
  onChange: (newValue: T[]) => void;
}

export function StringFilterValuePicker({
  query,
  stageIndex,
  column,
  value,
  placeholder,
  compact,
  getCreateLabel = query => query,
  onChange,
}: FilterValuePickerProps<string>) {
  const { fieldId, hasFieldValues } = useMemo(
    () => Lib.fieldValuesInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const { data = [] } = useFieldValuesQuery({
    id: fieldId != null ? fieldId : undefined,
    enabled: hasFieldValues === "list",
  });

  if (data.length > 0 && (data.length <= MAX_INLINE_OPTIONS || !compact)) {
    return (
      <InlineValuePicker
        data={data}
        value={value}
        compact={compact}
        onChange={onChange}
      />
    );
  }

  if (fieldId != null && hasFieldValues === "search") {
    return (
      <SearchValuePicker
        fieldId={fieldId}
        value={value}
        getCreateLabel={getCreateLabel}
        onChange={onChange}
      />
    );
  }

  return (
    <SelectValuePicker
      data={data}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      getCreateLabel={getCreateLabel}
    />
  );
}

export function NumberFilterValuePicker({
  query,
  stageIndex,
  column,
  value,
  placeholder,
  compact,
  onChange,
}: FilterValuePickerProps<number>) {
  return (
    <StringFilterValuePicker
      query={query}
      stageIndex={stageIndex}
      column={column}
      value={value.map(value => String(value))}
      placeholder={placeholder}
      compact={compact}
      getCreateLabel={query => (isFinite(parseFloat(query)) ? query : null)}
      onChange={newValue => onChange(newValue.map(value => parseFloat(value)))}
    />
  );
}
