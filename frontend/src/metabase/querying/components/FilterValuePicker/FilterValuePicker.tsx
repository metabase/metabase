import { useMemo } from "react";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import { useFieldValuesQuery } from "metabase/common/hooks";
import { SearchValuePicker } from "metabase/querying/components/FilterValuePicker/SearchValuePicker";
import { ListValuePicker } from "./ListValuePicker";
import { SelectValuePicker } from "./SelectValuePicker";
import { MAX_INLINE_OPTIONS } from "./constants";

interface FilterValuePickerProps<T> {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  value: T[];
  placeholder?: string;
  compact?: boolean;
  shouldCreate?: (query: string) => boolean;
  onChange: (newValue: T[]) => void;
}

export function StringFilterValuePicker({
  query,
  stageIndex,
  column,
  value,
  placeholder,
  compact,
  shouldCreate = query => query.length > 0,
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
      <ListValuePicker
        data={data}
        value={value}
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
      shouldCreate={query => isFinite(parseFloat(query))}
      onChange={newValue => onChange(newValue.map(value => parseFloat(value)))}
    />
  );
}
