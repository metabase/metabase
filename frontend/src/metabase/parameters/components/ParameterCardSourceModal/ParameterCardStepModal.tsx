import React, { useCallback } from "react";
import { t } from "ttag";
import { checkNotNull } from "metabase/core/utils/types";
import Button from "metabase/core/components/Button/Button";
import ModalContent from "metabase/components/ModalContent";
import DataPickerContainer, {
  DataPickerValue,
  useDataPickerValue,
} from "metabase/containers/DataPicker";
import { CardId } from "metabase-types/api";
import {
  getQuestionIdFromVirtualTableId,
  getQuestionVirtualTableId,
} from "metabase-lib/metadata/utils/saved-questions";

interface ParameterCardStepModalProps {
  cardId?: CardId;
  onSubmit: (cardId: CardId) => void;
  onClose?: () => void;
}

const ParameterCardStepModal = ({
  cardId,
  onSubmit,
  onClose,
}: ParameterCardStepModalProps): JSX.Element => {
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

export default ParameterCardStepModal;
