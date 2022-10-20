import { useCallback, useState } from "react";

import { DataPickerValue } from "./types";

function cleanSchemaValue({ databaseId, schemaId }: Partial<DataPickerValue>) {
  return databaseId ? schemaId : undefined;
}

function cleanTablesValue({
  databaseId,
  schemaId,
  tableIds,
}: Partial<DataPickerValue>) {
  if (!tableIds) {
    return [];
  }
  return databaseId && schemaId ? tableIds : [];
}

function cleanValue(value: Partial<DataPickerValue>): DataPickerValue {
  return {
    databaseId: value.databaseId,
    schemaId: cleanSchemaValue(value),
    tableIds: cleanTablesValue(value),
  };
}

type HookResult = [DataPickerValue, (value: DataPickerValue) => void];

function useDataPickerValue(
  initialValue: Partial<DataPickerValue> = {},
): HookResult {
  const [value, _setValue] = useState<DataPickerValue>(
    cleanValue(initialValue),
  );

  const setValue = useCallback((nextValue: DataPickerValue) => {
    _setValue(cleanValue(nextValue));
  }, []);

  return [value, setValue];
}

export default useDataPickerValue;
