import React, { useCallback, useState } from "react";
import { getSourceOptions } from "metabase/parameters/utils/dashboards";
import { CardId, ParameterSourceOptions } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import ParameterCardStepModal from "./ParameterCardStepModal";

export interface ParameterCardSourceModalProps {
  parameter: UiParameter;
  onChangeSourceOptions: (sourceOptions: ParameterSourceOptions) => void;
  onClose?: () => void;
}

const ParameterCardSourceModal = ({
  parameter,
  onChangeSourceOptions,
  onClose,
}: ParameterCardSourceModalProps): JSX.Element => {
  const sourceOptions = getSourceOptions(parameter);
  const [cardId, setCardId] = useState(sourceOptions.card_id);

  const handleSubmit = useCallback((cardId: CardId) => {
    setCardId(cardId);
  }, []);

  return (
    <ParameterCardStepModal
      cardId={cardId}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
};

export default ParameterCardSourceModal;
