import React, { ChangeEvent, useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button";
import Input from "metabase/core/components/Input";
import ModalContent from "metabase/components/ModalContent";
import DataPicker, {
  DataPickerDataType,
  DataPickerValue,
  useDataPicker,
  useDataPickerValue,
} from "metabase/containers/DataPicker";
import Questions from "metabase/entities/questions";
import Collections from "metabase/entities/collections";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, Collection, ValuesSourceConfig } from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import {
  getCollectionVirtualSchemaId,
  getQuestionIdFromVirtualTableId,
  getQuestionVirtualTableId,
} from "metabase-lib/metadata/utils/saved-questions";
import {
  ModalBody,
  ModalLoadingAndErrorWrapper,
} from "./ValuesSourceModal.styled";
import {
  DataPickerContainer,
  SearchInputContainer,
} from "./ValuesSourceCardModal.styled";

const DATA_PICKER_FILTERS = {
  types: (type: DataPickerDataType) =>
    type === "questions" || type === "models",
};

interface ModalOwnProps {
  name: string;
  sourceConfig: ValuesSourceConfig;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onSubmit: () => void;
  onClose: () => void;
}

interface ModalCardProps {
  card: Card | undefined;
}

interface ModalCollectionProps {
  collection: Collection | undefined;
}

interface ModalStateProps {
  question: Question | undefined;
}

type ModalProps = ModalOwnProps &
  ModalCardProps &
  ModalCollectionProps &
  ModalStateProps;

const ValuesSourceCardModal = ({
  name,
  question,
  collection,
  onChangeSourceConfig,
  onSubmit,
  onClose,
}: ModalProps): JSX.Element => {
  const initialValue = getInitialValue(question, collection);
  const [value, setValue] = useDataPickerValue(initialValue);
  const cardId = getCardIdFromValue(value);

  const handleSubmit = useCallback(() => {
    onChangeSourceConfig({ card_id: cardId });
    onSubmit();
  }, [cardId, onChangeSourceConfig, onSubmit]);

  return (
    <DataPicker.Provider>
      <ModalContent
        title={t`Selectable values for ${name}`}
        footer={[
          <Button key="cancel" onClick={onSubmit}>{t`Back`}</Button>,
          <Button
            key="submit"
            primary
            disabled={!cardId}
            onClick={handleSubmit}
          >
            {t`Done`}
          </Button>,
        ]}
        onClose={onClose}
      >
        <ModalBody>
          <DataPickerSearchInput />
          <DataPickerContainer>
            <DataPicker
              value={value}
              filters={DATA_PICKER_FILTERS}
              onChange={setValue}
            />
          </DataPickerContainer>
        </ModalBody>
      </ModalContent>
    </DataPicker.Provider>
  );
};

const DataPickerSearchInput = () => {
  const { search } = useDataPicker();
  const { query, setQuery } = search;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
    },
    [setQuery],
  );

  return (
    <SearchInputContainer>
      <Input
        value={query}
        placeholder={t`Search for a question or model`}
        leftIcon="search"
        fullWidth
        onChange={handleChange}
      />
    </SearchInputContainer>
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
    id: (state: State, { sourceConfig: { card_id } }: ModalOwnProps) => card_id,
    entityAlias: "card",
    LoadingAndErrorWrapper: ModalLoadingAndErrorWrapper,
  }),
  Collections.load({
    id: (state: State, { card }: ModalCardProps) =>
      card?.collection_id ?? "root",
    LoadingAndErrorWrapper: ModalLoadingAndErrorWrapper,
  }),
  connect((state: State, { card }: ModalCardProps) => ({
    question: card ? new Question(card, getMetadata(state)) : undefined,
  })),
)(ValuesSourceCardModal);
