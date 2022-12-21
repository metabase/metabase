import React, { useCallback, useState } from "react";
import { getSourceOptions } from "metabase/parameters/utils/dashboards";
import { ParameterSourceOptions } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import ParameterCardStepModal from "./ParameterCardStep";
import ParameterFieldStepModal from "./ParameterFieldStep";

export interface ParameterCardSourceModalProps {
  parameter: UiParameter;
  onChangeSourceOptions: (sourceOptions: ParameterSourceOptions) => void;
  onClose: () => void;
}

type ParameterCardSourceModalStep = "card" | "field";

const ParameterCardSourceModal = ({
  parameter,
  onChangeSourceOptions,
  onClose,
}: ParameterCardSourceModalProps): JSX.Element | null => {
  const sourceOptions = getSourceOptions(parameter);
  const [step, setStep] = useState<ParameterCardSourceModalStep>("card");
  const [cardId, setCardId] = useState(sourceOptions.card_id);
  const [fieldRef, setFieldRef] = useState(sourceOptions.value_field_ref);

  const handleCardSubmit = useCallback(() => {
    setStep("field");
  }, []);

  const handleFieldSubmit = useCallback(() => {
    onChangeSourceOptions({ card_id: cardId, value_field_ref: fieldRef });
    onClose();
  }, [cardId, fieldRef, onChangeSourceOptions, onClose]);

  const handleFieldCancel = useCallback(() => {
    setStep("card");
  }, []);

  switch (step) {
    case "card":
      return (
        <ParameterCardStepModal
          cardId={cardId}
          onChangeCard={setCardId}
          onSubmit={handleCardSubmit}
          onClose={onClose}
        />
      );
    case "field":
      return (
        <ParameterFieldStepModal
          cardId={cardId}
          fieldRef={fieldRef}
          onChangeField={setFieldRef}
          onSubmit={handleFieldSubmit}
          onCancel={handleFieldCancel}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
};

export default ParameterCardSourceModal;
