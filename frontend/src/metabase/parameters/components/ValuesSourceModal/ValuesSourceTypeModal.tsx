import React, { ChangeEvent, useCallback, useEffect, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button";
import Radio from "metabase/core/components/Radio";
import Select, {
  Option,
  SelectChangeEvent,
} from "metabase/core/components/Select";
import SelectButton from "metabase/core/components/SelectButton";
import ModalContent from "metabase/components/ModalContent";
import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import Fields from "metabase/entities/fields";
import Tables from "metabase/entities/tables";
import Questions from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Dataset,
  Card,
  ValuesSourceConfig,
  ValuesSourceType,
  FieldValue,
} from "metabase-types/api";
import { Dispatch, State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import Field from "metabase-lib/metadata/Field";
import { getQuestionVirtualTableId } from "metabase-lib/metadata/utils/saved-questions";
import {
  getCardSourceValues,
  getFieldSourceValues,
  isValidSourceConfig,
} from "metabase-lib/parameters/utils/parameter-source";
import { ModalLoadingAndErrorWrapper } from "./ValuesSourceModal.styled";
import {
  ModalHelpMessage,
  ModalLabel,
  ModalBodyWithPane,
  ModalMain,
  ModalPane,
  ModalSection,
  ModalTextArea,
  ModalErrorMessage,
  ModalEmptyState,
} from "./ValuesSourceTypeModal.styled";

const NEW_LINE = "\n";

const SOURCE_TYPE_OPTIONS = [
  { name: t`From connected fields`, value: null },
  { name: t`From another model or question`, value: "card" },
  { name: t`Custom list`, value: "static-list" },
];

interface ModalOwnProps {
  name: string;
  fields: Field[];
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onChangeCard: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

interface ModalCardProps {
  card: Card | undefined;
}

interface ModalStateProps {
  question: Question | undefined;
  fieldsValues: FieldValue[][];
  isLoadingFieldValues: boolean;
}

interface ModalDispatchProps {
  onFetchFieldValues: (fields: Field[]) => void;
}

interface QuestionLoaderProps {
  result?: Dataset;
}

type ModalProps = ModalOwnProps &
  ModalCardProps &
  ModalStateProps &
  ModalDispatchProps;

const ValuesSourceTypeModal = ({
  name,
  fields,
  fieldsValues,
  isLoadingFieldValues,
  question,
  sourceType,
  sourceConfig,
  onFetchFieldValues,
  onChangeSourceType,
  onChangeSourceConfig,
  onChangeCard,
  onSubmit,
  onClose,
}: ModalProps): JSX.Element => {
  useEffect(() => {
    onFetchFieldValues(fields);
  }, [fields, onFetchFieldValues]);

  return (
    <ModalContent
      title={t`Selectable values for ${name}`}
      footer={[
        <Button
          key="submit"
          primary
          disabled={!isValidSourceConfig(sourceType, sourceConfig)}
          onClick={onSubmit}
        >{t`Done`}</Button>,
      ]}
      onClose={onClose}
    >
      {sourceType === null ? (
        <FieldSourceModal
          fields={fields}
          fieldsValues={fieldsValues}
          isLoadingFieldValues={isLoadingFieldValues}
          sourceType={sourceType}
          onChangeSourceType={onChangeSourceType}
        />
      ) : sourceType === "card" ? (
        <CardSourceModal
          question={question}
          sourceType={sourceType}
          sourceConfig={sourceConfig}
          onChangeCard={onChangeCard}
          onChangeSourceType={onChangeSourceType}
          onChangeSourceConfig={onChangeSourceConfig}
        />
      ) : sourceType === "static-list" ? (
        <ListSourceModal
          sourceType={sourceType}
          sourceConfig={sourceConfig}
          onChangeSourceType={onChangeSourceType}
          onChangeSourceConfig={onChangeSourceConfig}
        />
      ) : null}
    </ModalContent>
  );
};

interface FieldSourceModalProps {
  fields: Field[];
  fieldsValues: FieldValue[][];
  isLoadingFieldValues: boolean;
  sourceType: ValuesSourceType;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
}

const FieldSourceModal = ({
  fields,
  fieldsValues,
  isLoadingFieldValues,
  sourceType,
  onChangeSourceType,
}: FieldSourceModalProps) => {
  const fieldValues = useMemo(() => {
    return getFieldSourceValues(fieldsValues);
  }, [fieldsValues]);

  const fieldValuesText = useMemo(() => {
    return getValuesText(fieldValues);
  }, [fieldValues]);

  const hasFields = fields.length > 0;
  const hasFieldValues = fieldValues.length > 0;

  return (
    <ModalBodyWithPane>
      <ModalPane>
        <ModalSection>
          <ModalLabel>{t`Where values should come from`}</ModalLabel>
          <Radio
            value={sourceType}
            options={SOURCE_TYPE_OPTIONS}
            vertical
            onChange={onChangeSourceType}
          />
        </ModalSection>
      </ModalPane>
      <ModalMain>
        {!hasFields ? (
          <ModalEmptyState>
            {t`You haven’t connected a field to this filter yet, so there aren’t any values.`}
          </ModalEmptyState>
        ) : !hasFieldValues && !isLoadingFieldValues ? (
          <ModalEmptyState>
            {t`We don’t have any cached values for the connected fields. Try one of the other options, or change this widget to a search box.`}
          </ModalEmptyState>
        ) : (
          <ModalTextArea value={fieldValuesText} readOnly fullWidth />
        )}
      </ModalMain>
    </ModalBodyWithPane>
  );
};

interface CardSourceModalProps {
  question: Question | undefined;
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  onChangeCard: () => void;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
}

const CardSourceModal = ({
  question,
  sourceType,
  sourceConfig,
  onChangeCard,
  onChangeSourceType,
  onChangeSourceConfig,
}: CardSourceModalProps) => {
  const fields = useMemo(() => {
    return question ? getSupportedFields(question) : [];
  }, [question]);

  const selectedField = useMemo(() => {
    return getFieldByReference(fields, sourceConfig.value_field);
  }, [fields, sourceConfig]);

  const fieldValuesQuestion = useMemo(() => {
    return question && selectedField && question.toFieldValues(selectedField);
  }, [question, selectedField]);

  const handleFieldChange = useCallback(
    (event: SelectChangeEvent<Field>) => {
      onChangeSourceConfig({
        ...sourceConfig,
        value_field: event.target.value.reference(),
      });
    },
    [sourceConfig, onChangeSourceConfig],
  );

  return (
    <ModalBodyWithPane>
      <ModalPane>
        <ModalSection>
          <ModalLabel>{t`Where values should come from`}</ModalLabel>
          <Radio
            value={sourceType}
            options={SOURCE_TYPE_OPTIONS}
            vertical
            onChange={onChangeSourceType}
          />
        </ModalSection>
        <ModalSection>
          <ModalLabel>{t`Model or question to supply the values`}</ModalLabel>
          <SelectButton onClick={onChangeCard}>
            {question ? question.displayName() : t`Pick a model or question…`}
          </SelectButton>
        </ModalSection>
        {question && (
          <ModalSection>
            <ModalLabel>{t`Column to supply the values`}</ModalLabel>
            {fields.length ? (
              <Select
                value={selectedField}
                placeholder={t`Pick a column…`}
                onChange={handleFieldChange}
              >
                {fields.map((field, index) => (
                  <Option
                    key={index}
                    name={field.displayName()}
                    value={field}
                  />
                ))}
              </Select>
            ) : (
              <ModalErrorMessage>
                {question.isDataset()
                  ? t`This model doesn’t have any text columns.`
                  : t`This question doesn’t have any text columns.`}{" "}
                {t`Please pick a different model or question.`}
              </ModalErrorMessage>
            )}
          </ModalSection>
        )}
      </ModalPane>
      <ModalMain>
        {!question ? (
          <ModalEmptyState>{t`Pick a model or question`}</ModalEmptyState>
        ) : !selectedField ? (
          <ModalEmptyState>{t`Pick a column`}</ModalEmptyState>
        ) : (
          <QuestionResultLoader question={fieldValuesQuestion}>
            {({ result }: QuestionLoaderProps) => (
              <ModalTextArea
                value={result ? getValuesText(getCardSourceValues(result)) : ""}
                readOnly
                fullWidth
              />
            )}
          </QuestionResultLoader>
        )}
      </ModalMain>
    </ModalBodyWithPane>
  );
};

interface ListSourceModalProps {
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
}

const ListSourceModal = ({
  sourceType,
  sourceConfig,
  onChangeSourceType,
  onChangeSourceConfig,
}: ListSourceModalProps) => {
  const handleValuesChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChangeSourceConfig({ values: getStaticValues(event.target.value) });
    },
    [onChangeSourceConfig],
  );

  return (
    <ModalBodyWithPane>
      <ModalPane>
        <ModalSection>
          <ModalLabel>{t`Where values should come from`}</ModalLabel>
          <Radio
            value={sourceType}
            options={SOURCE_TYPE_OPTIONS}
            vertical
            onChange={onChangeSourceType}
          />
          <ModalHelpMessage>{t`Enter one value per line.`}</ModalHelpMessage>
        </ModalSection>
      </ModalPane>
      <ModalMain>
        <ModalTextArea
          defaultValue={getValuesText(sourceConfig.values)}
          fullWidth
          onChange={handleValuesChange}
        />
      </ModalMain>
    </ModalBodyWithPane>
  );
};

const getValuesText = (values?: string[]) => {
  return values?.join(NEW_LINE) ?? "";
};

const getStaticValues = (value: string) => {
  return value
    .split(NEW_LINE)
    .map(line => line.trim())
    .filter(line => line.length > 0);
};

const getFieldByReference = (fields: Field[], fieldReference?: unknown[]) => {
  return fields.find(field => _.isEqual(field.reference(), fieldReference));
};

const getSupportedFields = (question: Question) => {
  const fields = question.composeThisQuery()?.table()?.fields ?? [];
  return fields.filter(field => field.isString());
};

const mapStateToProps = (
  state: State,
  { card, fields }: ModalOwnProps & ModalCardProps,
): ModalStateProps => ({
  question: card ? new Question(card, getMetadata(state)) : undefined,
  fieldsValues: fields.map(field =>
    Fields.selectors.getFieldValues(state, { entityId: field.id }),
  ),
  isLoadingFieldValues: fields.every(field =>
    Fields.selectors.getLoading(state, {
      entityId: field.id,
      requestType: "values",
    }),
  ),
});

const mapDispatchToProps = (dispatch: Dispatch): ModalDispatchProps => ({
  onFetchFieldValues: (fields: Field[]) => {
    fields.forEach(field =>
      dispatch(Fields.actions.fetchFieldValues({ id: field.id })),
    );
  },
});

export default _.compose(
  Tables.load({
    id: (state: State, { sourceConfig: { card_id } }: ModalOwnProps) =>
      card_id ? getQuestionVirtualTableId(card_id) : undefined,
    requestType: "fetchMetadata",
    LoadingAndErrorWrapper: ModalLoadingAndErrorWrapper,
  }),
  Questions.load({
    id: (state: State, { sourceConfig: { card_id } }: ModalOwnProps) => card_id,
    entityAlias: "card",
    LoadingAndErrorWrapper: ModalLoadingAndErrorWrapper,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(ValuesSourceTypeModal);
