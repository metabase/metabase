import { useMemo } from "react";
import { t } from "ttag";

import CardPicker from "./CardPicker";
import { Root } from "./DataPickerView.styled";
import DataSearch from "./DataSearch";
import DataTypePicker from "./DataTypePicker";
import EmptyState from "./EmptyState";
import RawDataPicker from "./RawDataPicker";
import { MIN_SEARCH_LENGTH } from "./constants";
import type {
  DataPickerProps,
  DataPickerDataType,
  DataTypeInfoItem,
} from "./types";

interface DataPickerViewProps extends DataPickerProps {
  dataTypes: DataTypeInfoItem[];
  searchQuery: string;
  hasDataAccess: boolean;
  onDataTypeChange: (type: DataPickerDataType) => void;
  onBack?: () => void;
}

function DataPickerViewContent({
  dataTypes,
  searchQuery,
  hasDataAccess,
  onDataTypeChange,
  ...props
}: DataPickerViewProps) {
  const { value, onChange } = props;

  const availableDataTypes = useMemo(
    () => dataTypes.map(type => type.id),
    [dataTypes],
  );

  if (!hasDataAccess) {
    return (
      <EmptyState
        message={t`To pick some data, you'll need to add some first`}
        icon="database"
      />
    );
  }

  if (searchQuery.trim().length > MIN_SEARCH_LENGTH) {
    return (
      <DataSearch
        searchQuery={searchQuery}
        availableDataTypes={availableDataTypes}
        onChange={onChange}
      />
    );
  }

  if (!value.type) {
    return <DataTypePicker types={dataTypes} onChange={onDataTypeChange} />;
  }

  if (value.type === "raw-data") {
    return <RawDataPicker {...props} />;
  }

  if (value.type === "models") {
    return <CardPicker {...props} targetModel="model" />;
  }

  if (value.type === "questions") {
    return <CardPicker {...props} targetModel="question" />;
  }

  return null;
}

function DataPickerView(props: DataPickerViewProps) {
  return (
    <Root>
      <DataPickerViewContent {...props} />
    </Root>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataPickerView;
