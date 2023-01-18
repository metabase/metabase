import React, { useCallback, useMemo, useState } from "react";
import {
  Parameter,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import {
  getNonVirtualFields,
  hasFields,
} from "metabase-lib/parameters/utils/parameter-fields";
import {
  getSourceConfig,
  getSourceConfigForType,
  getSourceType,
} from "metabase-lib/parameters/utils/parameter-source";
import ValuesSourceTypeModal from "./ValuesSourceTypeModal";
import ValuesSourceCardModal from "./ValuesSourceCardModal";

type ModalStep = "main" | "card";

interface ModalProps {
  parameter: Parameter;
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
  const [sourceType, setSourceType] = useState(getInitialSourceType(parameter));
  const [sourceConfig, setSourceConfig] = useState(getSourceConfig(parameter));

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
      hasFields={hasFields(parameter)}
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

const getInitialSourceType = (parameter: Parameter) => {
  const sourceType = getSourceType(parameter);
  return hasFields(parameter) ? sourceType : sourceType ?? "card";
};

export default ValuesSourceModal;
