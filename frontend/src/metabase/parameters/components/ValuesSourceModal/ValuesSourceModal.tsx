import React, { useEffect, useState } from "react";
import { UiParameter } from "metabase-lib/parameters/types";
import SourceTypeModal from "./SourceTypeModal";

interface ValuesSourceModalProps {
  parameter: UiParameter;
  fieldValues: string[];
  onFetchFieldValues: (parameter: UiParameter) => void;
  onClose: () => void;
}

const ValuesSourceModal = ({
  parameter,
  fieldValues,
  onFetchFieldValues,
  onClose,
}: ValuesSourceModalProps): JSX.Element => {
  const [sourceType, setSourceType] = useState(
    parameter.values_source_type ?? null,
  );
  const [sourceConfig, setSourceConfig] = useState(
    parameter.values_source_config ?? {},
  );

  useEffect(() => {
    onFetchFieldValues?.(parameter);
  }, [parameter, onFetchFieldValues]);

  return (
    <SourceTypeModal
      sourceType={sourceType}
      sourceConfig={sourceConfig}
      fieldValues={fieldValues}
      onChangeSourceType={setSourceType}
      onChangeSourceConfig={setSourceConfig}
      onClose={onClose}
    />
  );
};

export default ValuesSourceModal;
