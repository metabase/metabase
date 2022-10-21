import { useCallback, useState } from "react";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/lib/metadata/utils/saved-questions";

import { DataPickerValue } from "./types";

function cleanDatabaseValue({ type, databaseId }: Partial<DataPickerValue>) {
  const isUsingVirtualTables = type === "models" || type === "questions";
  if (isUsingVirtualTables) {
    return SAVED_QUESTIONS_VIRTUAL_DB_ID;
  }
  return databaseId;
}

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
    type: value.type,
    databaseId: cleanDatabaseValue(value),
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
