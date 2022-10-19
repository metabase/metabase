import React, { useCallback, useMemo } from "react";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/lib/metadata/utils/saved-questions";

import type { DataPickerProps, DataPickerDataType } from "./types";

import { getDataTypes } from "./utils";

import CardPicker from "./CardPicker";
import DataTypePicker from "./DataTypePicker";
import RawDataPicker from "./RawDataPicker";

function DataPicker(props: DataPickerProps) {
  const { value, onChange } = props;

  const dataTypes = useMemo(() => getDataTypes(), []);

  const handleDataTypeChange = useCallback(
    (type: DataPickerDataType) => {
      const isUsingVirtualTables = type === "models" || type === "questions";
      onChange({
        type,
        databaseId: isUsingVirtualTables
          ? SAVED_QUESTIONS_VIRTUAL_DB_ID
          : undefined,
        schemaId: undefined,
        tableIds: [],
      });
    },
    [onChange],
  );

  const handleBack = useCallback(() => {
    onChange({
      type: undefined,
      databaseId: undefined,
      schemaId: undefined,
      tableIds: [],
    });
  }, [onChange]);

  if (!value.type) {
    return <DataTypePicker types={dataTypes} onChange={handleDataTypeChange} />;
  }

  if (value.type === "raw-data") {
    return <RawDataPicker {...props} onBack={handleBack} />;
  }

  if (value.type === "models") {
    return <CardPicker {...props} targetModel="model" onBack={handleBack} />;
  }

  if (value.type === "questions") {
    return <CardPicker {...props} targetModel="question" onBack={handleBack} />;
  }

  return null;
}

export default DataPicker;
