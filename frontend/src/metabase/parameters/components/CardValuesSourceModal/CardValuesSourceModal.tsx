import React, { useCallback, useState } from "react";
import { ValuesSourceConfig } from "metabase-types/api";
import CardStepModal from "./CardStepModal";
import FieldStepModal from "./FieldStepModal";

type ModalStep = "card" | "field";

export interface CardValuesSourceModalProps {
  sourceConfig: ValuesSourceConfig;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onClose: () => void;
}

const CardValuesSourceModal = ({
  sourceConfig,
  onChangeSourceConfig,
  onClose,
}: CardValuesSourceModalProps): JSX.Element | null => {
  const [step, setStep] = useState<ModalStep>("card");
  const [cardId, setCardId] = useState(sourceConfig.card_id);
  const [fieldReference, setFieldReference] = useState(
    sourceConfig.value_field,
  );

  const handleCardSubmit = useCallback(() => {
    setStep("field");
  }, []);

  const handleFieldSubmit = useCallback(() => {
    onChangeSourceConfig({ card_id: cardId, value_field: fieldReference });
    onClose();
  }, [cardId, fieldReference, onChangeSourceConfig, onClose]);

  const handleFieldCancel = useCallback(() => {
    setStep("card");
  }, []);

  switch (step) {
    case "card":
      return (
        <CardStepModal
          cardId={cardId}
          onChangeCard={setCardId}
          onSubmit={handleCardSubmit}
          onClose={onClose}
        />
      );
    case "field":
      return (
        <FieldStepModal
          cardId={cardId}
          fieldReference={fieldReference}
          onChangeField={setFieldReference}
          onSubmit={handleFieldSubmit}
          onCancel={handleFieldCancel}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
};

export default CardValuesSourceModal;
