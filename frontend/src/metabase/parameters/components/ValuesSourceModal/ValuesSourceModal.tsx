import React, { useCallback, useMemo, useState } from "react";
import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";
import { getNonVirtualFields } from "metabase-lib/parameters/utils/parameter-fields";
import { getSourceConfigForType } from "metabase-lib/parameters/utils/parameter-source";
import { UiParameter } from "metabase-lib/parameters/types";
import ValuesSourceTypeModal from "./ValuesSourceTypeModal";
import ValuesSourceCardModal from "./ValuesSourceCardModal";

type ModalStep = "main" | "card";

interface ModalProps {
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
}: ModalProps): JSX.Element => {
  const [step, setStep] = useState<ModalStep>("main");
  const [sourceType, setSourceType] = useState(parameter.values_source_type);
  const [sourceConfig, setSourceConfig] = useState(
    parameter.values_source_config,
  );

  const fields = useMemo(() => {
    return getNonVirtualFields(parameter);
  }, [parameter]);

  const handlePickerOpen = useCallback(() => {
    setStep("card");
  }, []);

  const handlePickerClose = useCallback(() => {
    setStep("main");
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit(sourceType, getSourceConfigForType(sourceType, sourceConfig));
    onClose();
  }, [sourceType, sourceConfig, onSubmit, onClose]);

  return step === "main" ? (
    <ValuesSourceTypeModal
      name={parameter.name}
      fields={fields}
      sourceType={sourceType}
      sourceConfig={sourceConfig}
      onChangeSourceType={setSourceType}
      onChangeSourceConfig={setSourceConfig}
      onChangeCard={handlePickerOpen}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  ) : (
    <ValuesSourceCardModal
      name={parameter.name}
      sourceConfig={sourceConfig}
      onChangeSourceConfig={setSourceConfig}
      onSubmit={handlePickerClose}
      onClose={onClose}
    />
  );
};

export default ValuesSourceModal;
