import { type JSX, useCallback, useState } from "react";

import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { hasFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import {
  getSourceConfig,
  getSourceConfigForType,
  getSourceType,
} from "metabase-lib/v1/parameters/utils/parameter-source";
import { isNumberParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import type { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";

import { ValuesSourceCardModal } from "./ValuesSourceCardModal";
import ValuesSourceTypeModal from "./ValuesSourceTypeModal";

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

  // The picker opens on top of the main step rather than replacing it, so the
  // main step's modal isn't torn down and re-animated between steps. Its panel
  // is hidden meanwhile, as it's wider than the picker on wide screens
  return (
    <>
      <ValuesSourceTypeModal
        parameter={parameter}
        isContentHidden={step === "card"}
        sourceType={sourceType}
        sourceConfig={sourceConfig}
        onChangeSourceType={setSourceType}
        onChangeSourceConfig={setSourceConfig}
        onChangeCard={handlePickerOpen}
        onSubmit={handleSubmit}
        onClose={onClose}
      />
      {step === "card" && (
        <ValuesSourceCardModal
          parameter={parameter}
          sourceConfig={sourceConfig}
          onChangeSourceConfig={setSourceConfig}
          onSubmit={handlePickerClose}
          onClose={handlePickerClose}
        />
      )}
    </>
  );
};

/**
 * after using this function to initialize sourceType, we know that:
 * (initial sourceType === null) => hasFields(parameter)
 */
const getInitialSourceType = (parameter: UiParameter) => {
  const sourceType = getSourceType(parameter);

  if (sourceType === null && !hasFields(parameter)) {
    if (isNumberParameter(parameter)) {
      return "static-list";
    }
    return "card";
  }

  return sourceType;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ValuesSourceModal;
