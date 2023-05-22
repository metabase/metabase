import React, { ChangeEvent, useCallback, useEffect } from "react";
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
import Tables from "metabase/entities/tables";
import { coerceCollectionId } from "metabase/collections/utils";
import {
  CardId,
  Collection,
  Parameter,
  ValuesSourceConfig,
} from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import {
  getCollectionVirtualSchemaId,
  getQuestionIdFromVirtualTableId,
  getQuestionVirtualTableId,
} from "metabase-lib/metadata/utils/saved-questions";
import { ModalLoadingAndErrorWrapper } from "./ValuesSourceModal.styled";
import {
  DataPickerContainer,
  ModalBodyWithSearch,
  SearchInputContainer,
} from "./ValuesSourceCardModal.styled";

const DATA_PICKER_FILTERS = {
  types: (type: DataPickerDataType) =>
    type === "questions" || type === "models",
};

interface ModalOwnProps {
  parameter: Parameter;
  sourceConfig: ValuesSourceConfig;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onSubmit: () => void;
  onClose: () => void;
}

interface ModalQuestionProps {
  question: Question | undefined;
}

interface ModalCollectionProps {
  collection: Collection | undefined;
}

interface ModalDispatchProps {
  onFetchCard: (cardId: CardId) => void;
  onFetchMetadata: (cardId: CardId) => void;
}

type ModalProps = ModalOwnProps &
  ModalQuestionProps &
  ModalCollectionProps &
  ModalDispatchProps;

const ValuesSourceCardModal = ({
  parameter,
  question,
  collection,
  onFetchCard,
  onFetchMetadata,
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

  useEffect(() => {
    if (cardId) {
      onFetchCard(cardId);
      onFetchMetadata(cardId);
    }
  }, [cardId, onFetchCard, onFetchMetadata]);

  return (
    <DataPicker.Provider>
      <ModalContent
        title={t`Selectable values for ${parameter.name}`}
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
        <ModalBodyWithSearch>
          <DataPickerSearchInput />
          <DataPickerContainer>
            <DataPicker
              value={value}
              filters={DATA_PICKER_FILTERS}
              onChange={setValue}
            />
          </DataPickerContainer>
        </ModalBodyWithSearch>
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

const mapDispatchToProps: ModalDispatchProps = {
  onFetchCard: (cardId: CardId) => Questions.actions.fetch({ id: cardId }),
  onFetchMetadata: (cardId: CardId) =>
    Tables.actions.fetchMetadata({ id: getQuestionVirtualTableId(cardId) }),
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Questions.load({
    id: (state: State, { sourceConfig: { card_id } }: ModalOwnProps) => card_id,
    LoadingAndErrorWrapper: ModalLoadingAndErrorWrapper,
  }),
  Collections.load({
    id: (state: State, { question }: ModalQuestionProps) =>
      question ? coerceCollectionId(question?.collectionId()) : undefined,
    LoadingAndErrorWrapper: ModalLoadingAndErrorWrapper,
  }),
  connect(null, mapDispatchToProps),
)(ValuesSourceCardModal);
