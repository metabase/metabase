import React, { useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button/Button";
import ModalContent from "metabase/components/ModalContent";
import DataPickerContainer, {
  DataPickerValue,
  useDataPickerValue,
} from "metabase/containers/DataPicker";
import Questions from "metabase/entities/questions";
import Collections from "metabase/entities/collections";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, CardId, Collection } from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import {
  getCollectionVirtualSchemaId,
  getQuestionIdFromVirtualTableId,
  getQuestionVirtualTableId,
} from "metabase-lib/metadata/utils/saved-questions";
import { ModalBody } from "./CardStepModal.styled";

interface CardStepModalOwnProps {
  cardId: CardId | undefined;
  onChangeCard: (cardId: CardId | undefined) => void;
  onSubmit: () => void;
  onClose: () => void;
}

interface CardStepModalCardProps {
  card: Card | undefined;
}

interface CardStepModalCollectionProps {
  collection: Collection | undefined;
}

interface CardStepModalStateProps {
  question: Question | undefined;
}

type CardStepModalProps = CardStepModalOwnProps &
  CardStepModalCardProps &
  CardStepModalCollectionProps &
  CardStepModalStateProps;

const CardStepModal = ({
  question,
  collection,
  onChangeCard,
  onSubmit,
  onClose,
}: CardStepModalProps): JSX.Element => {
  const initialValue = getInitialValue(question, collection);
  const [value, setValue] = useDataPickerValue(initialValue);
  const cardId = getCardIdFromValue(value);

  const handleSubmit = useCallback(() => {
    onChangeCard(cardId);
    onSubmit();
  }, [cardId, onChangeCard, onSubmit]);

  return (
    <ModalContent
      title={t`Pick a model or question to use for the values of this widget`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button
          key="submit"
          primary
          disabled={cardId == null}
          onClick={handleSubmit}
        >{t`Select column`}</Button>,
      ]}
      onClose={onSubmit}
    >
      <ModalBody>
        <DataPickerContainer value={value} onChange={setValue} />
      </ModalBody>
    </ModalContent>
  );
};

const getInitialValue = (
  question?: Question,
  collection?: Collection,
): Partial<DataPickerValue> | undefined => {
  if (question) {
    const id = question.id();
    const isDatasets = question.isDataset();

    return {
      type: isDatasets ? "models" : "questions",
      schemaId: getCollectionVirtualSchemaId(collection, { isDatasets }),
      collectionId: collection?.id,
      tableIds: [getQuestionVirtualTableId(id)],
    };
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

export default _.compose(
  Questions.load({
    id: (state: State, { cardId }: CardStepModalOwnProps) => cardId,
    entityAlias: "card",
  }),
  Collections.load({
    id: (state: State, { card }: CardStepModalCardProps) =>
      card?.collection_id ?? "root",
  }),
  connect((state: State, { card }: CardStepModalCardProps) => ({
    question: card ? new Question(card, getMetadata(state)) : undefined,
  })),
)(CardStepModal);
