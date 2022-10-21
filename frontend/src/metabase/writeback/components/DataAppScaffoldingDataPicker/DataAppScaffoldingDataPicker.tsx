import React from "react";

import DataPicker, {
  DataPickerProps,
  DataPickerFiltersProp,
} from "metabase/containers/DataPicker";

const FILTERS: DataPickerFiltersProp = {
  types: type => type !== "questions",
};

type DataAppScaffoldingDataPickerProps = Omit<DataPickerProps, "filters">;

function DataAppScaffoldingDataPicker(
  props: DataAppScaffoldingDataPickerProps,
) {
  return <DataPicker {...props} filters={FILTERS} />;
}

export default DataAppScaffoldingDataPicker;
