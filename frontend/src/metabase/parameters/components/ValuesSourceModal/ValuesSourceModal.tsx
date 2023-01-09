import React, { useCallback, useMemo, useState } from "react";
import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";
import { getNonVirtualFields } from "metabase-lib/parameters/utils/parameter-fields";
import { UiParameter } from "metabase-lib/parameters/types";
import ValuesSourceTypeModal from "./ValuesSourceTypeModal";

interface ValuesSourceModalProps {
  parameter: UiParameter;
  onSubmit: (
    sourceType: ValuesSourceType,
    sourceConfig: ValuesSourceConfig,
  ) => void;
  onClose: () => void;
}

const ValuesSourceModal = ({
  parameter,
  onSubmit,
  onClose,
}: ValuesSourceModalProps): JSX.Element => {
  const fields = useMemo(() => {
    return getNonVirtualFields(parameter);
  }, [parameter]);

  const [sourceType, setSourceType] = useState(
    parameter.values_source_type ?? null,
  );

  const [sourceConfig, setSourceConfig] = useState(
    parameter.values_source_config ?? {},
  );

  const handleSubmit = useCallback(() => {
    onSubmit(sourceType, sourceConfig);
    onClose();
  }, [sourceType, sourceConfig, onSubmit, onClose]);

  return (
    <ValuesSourceTypeModal
      name={parameter.name}
      fields={fields}
      sourceType={sourceType}
      sourceConfig={sourceConfig}
      onChangeSourceType={setSourceType}
      onChangeSourceConfig={setSourceConfig}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
};

export default ValuesSourceModal;
