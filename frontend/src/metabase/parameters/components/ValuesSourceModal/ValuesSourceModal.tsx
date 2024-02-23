import { useCallback, useState } from "react";

import { ParameterWithTemplateTagTarget } from "metabase-lib/parameters/types";
import {
  getSourceConfig,
  getSourceConfigForType,
  getSourceType,
} from "metabase-lib/parameters/utils/parameter-source";
import {
  Parameter,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";

import ValuesSourceCardModal from "./ValuesSourceCardModal";
import ValuesSourceTypeModal from "./ValuesSourceTypeModal";

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
      parameter={parameter}
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
      parameter={parameter}
      sourceConfig={sourceConfig}
      onChangeSourceConfig={setSourceConfig}
      onSubmit={handlePickerClose}
      onClose={onClose}
    />
  );
};

const getInitialSourceType = (parameter: ParameterWithTemplateTagTarget) => {
  const sourceType = getSourceType(parameter);

  return sourceType === null && parameter.hasVariableTemplateTagTarget
    ? "card"
    : sourceType;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ValuesSourceModal;
