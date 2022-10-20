import React from "react";

import type { DataPickerProps } from "./types";
import RawDataPanePicker from "./RawDataPanePicker";

function DataPicker(props: DataPickerProps) {
  return <RawDataPanePicker {...props} />;
}

export default DataPicker;
