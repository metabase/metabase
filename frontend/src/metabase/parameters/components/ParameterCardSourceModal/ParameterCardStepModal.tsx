import React, { useCallback } from "react";
import { t } from "ttag";
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
  cardId: CardId | undefined;
  onChangeCardId: (cardId: CardId | undefined) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const ParameterCardStepModal = ({
  cardId,
  onChangeCardId,
  onSubmit,
  onClose,
}: ParameterCardStepModalProps): JSX.Element => {
  const [value, setValue] = useDataPickerValue(getValueFromCardId(cardId));

  const handleChange = useCallback(
    (value: DataPickerValue) => {
      setValue(value);
      onChangeCardId(getCardIdFromValue(value));
    },
    [setValue, onChangeCardId],
  );

  return (
    <ModalContent
      title={t`Pick a model or question to use for the values of this widget`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button
          key="submit"
          primary
          disabled={!value.tableIds.length}
          onClick={onSubmit}
        >{t`Select columns`}</Button>,
      ]}
      onClose={onClose}
    >
      <DataPickerContainer value={value} onChange={handleChange} />
    </ModalContent>
  );
};

const getValueFromCardId = (cardId?: CardId) => {
  if (cardId != null) {
    return { tableIds: [getQuestionVirtualTableId(cardId)] };
  }
};

const getCardIdFromValue = ({ tableIds }: DataPickerValue) => {
  if (tableIds.length) {
    const cardId = getQuestionIdFromVirtualTableId(tableIds[0]);
    if (cardId != null) {
      return cardId;
    }
  }
};

export default ParameterCardStepModal;
