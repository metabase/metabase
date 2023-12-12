import * as Lib from "metabase-lib";
import { useFieldValuesQuery } from "metabase/common/hooks";
import { InlineValuePicker } from "./InlineValuePicker";
import { SelectValuePicker } from "./SelectValuePicker";
import { MAX_INLINE_OPTIONS } from "./constants";

interface FilterValuePickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  value: string[];
  placeholder: string;
  getCreateLabel: (query: string) => string | null;
  onChange: (newValue: string[]) => void;
}

export function FilterValuePicker({
  query,
  stageIndex,
  column,
  value,
  placeholder,
  getCreateLabel,
  onChange,
}: FilterValuePickerProps) {
  const { fieldId, hasFieldValues } = Lib.fieldValuesInfo(
    query,
    stageIndex,
    column,
  );

  const { data = [] } = useFieldValuesQuery({
    id: fieldId != null ? fieldId : undefined,
    enabled: hasFieldValues === "list",
  });

  if (data.length > 0 && data.length <= MAX_INLINE_OPTIONS) {
    return <InlineValuePicker data={data} value={value} onChange={onChange} />;
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
