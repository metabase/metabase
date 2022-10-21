import React, { useCallback } from "react";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/lib/metadata/utils/saved-questions";

import type { DataPickerProps, DataPickerDataType } from "./types";

import CardPicker from "./CardPicker";
import DataTypePicker from "./DataTypePicker";
import RawDataPanePicker from "./RawDataPanePicker";

function DataPicker(props: DataPickerProps) {
  const { value, onChange } = props;

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
    return <DataTypePicker onChange={handleDataTypeChange} />;
  }

  if (value.type === "raw-data") {
    return <RawDataPanePicker {...props} onBack={handleBack} />;
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
