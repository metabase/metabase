import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { checkNotNull } from "metabase/core/utils/types";
import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";
import DataPickerContainer, {
  DataPickerValue,
  useDataPickerValue,
} from "metabase/containers/DataPicker";
import { getSourceOptions } from "metabase/parameters/utils/dashboards";
import { CardId, ParameterSourceOptions } from "metabase-types/api";
import {
  getQuestionIdFromVirtualTableId,
  getQuestionVirtualTableId,
} from "metabase-lib/metadata/utils/saved-questions";
import { UiParameter } from "metabase-lib/parameters/types";

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
    <CardSourceModal
      cardId={cardId}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
};

interface CardSourceModalProps {
  cardId?: CardId;
  onSubmit: (cardId: CardId) => void;
  onClose?: () => void;
}

const CardSourceModal = ({
  cardId,
  onSubmit,
  onClose,
}: CardSourceModalProps): JSX.Element => {
  const [value, setValue] = useDataPickerValue(getValueFromCardId(cardId));

  const handleSubmit = useCallback(() => {
    const newCardId = getCardIdFromValue(value);
    onSubmit(checkNotNull(newCardId));
  }, [value, onSubmit]);

  return (
    <ModalContent
      title={t`Pick a model or question to use for the values of this widget`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button
          key="submit"
          primary
          disabled={!value.tableIds.length}
          onClick={handleSubmit}
        >{t`Select columns`}</Button>,
      ]}
      onClose={onClose}
    >
      <DataPickerContainer value={value} onChange={setValue} />
    </ModalContent>
  );
};

const getValueFromCardId = (cardId?: CardId): Partial<DataPickerValue> => {
  return cardId != null
    ? { tableIds: [getQuestionVirtualTableId(cardId)] }
    : {};
};

const getCardIdFromValue = ({ tableIds }: DataPickerValue) => {
  return tableIds.length
    ? getQuestionIdFromVirtualTableId(tableIds[0])
    : undefined;
};

export default ParameterCardSourceModal;
