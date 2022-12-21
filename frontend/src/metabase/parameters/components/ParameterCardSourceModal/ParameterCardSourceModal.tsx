import React, { useCallback, useState } from "react";
import { getSourceOptions } from "metabase/parameters/utils/dashboards";
import { CardId, ParameterSourceOptions } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import ParameterCardStepModal from "./ParameterCardStepModal";
import ParameterFieldStepModal from "./ParameterFieldStepModal";

export interface ParameterCardSourceModalProps {
  parameter: UiParameter;
  onChangeSourceOptions: (sourceOptions: ParameterSourceOptions) => void;
  onClose?: () => void;
}

type ParameterCardSourceModalStep = "card" | "field";

const ParameterCardSourceModal = ({
  parameter,
  onChangeSourceOptions,
  onClose,
}: ParameterCardSourceModalProps): JSX.Element | null => {
  const sourceOptions = getSourceOptions(parameter);
  const [cardId, setCardId] = useState(sourceOptions.card_id);
  const [step, setStep] = useState<ParameterCardSourceModalStep>("card");

  const handleSubmit = useCallback((cardId: CardId) => {
    setCardId(cardId);
    setStep("field");
  }, []);

  switch (step) {
    case "card":
      return (
        <ParameterCardStepModal
          cardId={cardId}
          onSubmit={handleSubmit}
          onClose={onClose}
        />
      );
    case "field":
      return <ParameterFieldStepModal cardId={cardId} onClose={onClose} />;
    default:
      return null;
  }
};

export default ParameterCardSourceModal;
