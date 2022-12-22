import React, { useCallback, useState } from "react";
import ParameterCardStepModal from "./ParameterCardStep";
import ParameterFieldStepModal from "./ParameterFieldStep";
import { ValuesSourceConfig } from "metabase-types/api";

export interface ValuesCardSourceModalProps {
  sourceConfig: ValuesSourceConfig;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onClose: () => void;
}

type ValuesCardSourceModalStep = "card" | "field";

const ValuesCardSourceModal = ({
  sourceConfig,
  onChangeSourceConfig,
  onClose,
}: ValuesCardSourceModalProps): JSX.Element | null => {
  const [step, setStep] = useState<ValuesCardSourceModalStep>("card");
  const [cardId, setCardId] = useState(sourceConfig.card_id);
  const [fieldRef, setFieldRef] = useState(sourceConfig.value_field_ref);

  const handleCardSubmit = useCallback(() => {
    setStep("field");
  }, []);

  const handleFieldSubmit = useCallback(() => {
    onChangeSourceConfig({ card_id: cardId, value_field_ref: fieldRef });
    onClose();
  }, [cardId, fieldRef, onChangeSourceConfig, onClose]);

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

export default ValuesCardSourceModal;
