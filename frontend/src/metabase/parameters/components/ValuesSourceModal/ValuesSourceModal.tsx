import { useCallback, useState } from "react";
import type { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";
import {
  getSourceConfig,
  getSourceConfigForType,
  getSourceType,
} from "metabase-lib/parameters/utils/parameter-source";
import type { UiParameter } from "metabase-lib/parameters/types";
import { hasFields } from "metabase-lib/parameters/utils/parameter-fields";
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

/**
 * after using this function to initialize sourceType, we know that:
 * (intial sourceType === null) => hasFields(parameter)
 */
const getInitialSourceType = (parameter: UiParameter) => {
  const sourceType = getSourceType(parameter);

  return sourceType === null && !hasFields(parameter) ? "card" : sourceType;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ValuesSourceModal;
