import React, { useCallback, useState } from "react";
import { ValuesSourceConfig } from "metabase-types/api";
import ParameterCardStepModal from "./CardStepModal";
import ParameterFieldStepModal from "./FieldStepModal";

type CardSourceStep = "card" | "field";

export interface CardSourceModalProps {
  sourceConfig: ValuesSourceConfig;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onClose: () => void;
}

const CardSourceModal = ({
  sourceConfig,
  onChangeSourceConfig,
  onClose,
}: CardSourceModalProps): JSX.Element | null => {
  const [step, setStep] = useState<CardSourceStep>("card");
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

export default CardSourceModal;
