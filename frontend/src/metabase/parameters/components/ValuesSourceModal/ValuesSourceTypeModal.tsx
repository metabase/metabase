import React, {
  ChangeEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button";
import Radio, { RadioOption } from "metabase/core/components/Radio";
import Select, {
  Option,
  SelectChangeEvent,
} from "metabase/core/components/Select";
import SelectButton from "metabase/core/components/SelectButton";
import ModalContent from "metabase/components/ModalContent";
import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";
import Tables from "metabase/entities/tables";
import Questions from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Card,
  ValuesSourceConfig,
  ValuesSourceType,
  Parameter,
  ParameterValues,
  ParameterValue,
} from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import Field from "metabase-lib/metadata/Field";
import { getQuestionVirtualTableId } from "metabase-lib/metadata/utils/saved-questions";
import { getFields } from "metabase-lib/parameters/utils/parameter-fields";
import { isValidSourceConfig } from "metabase-lib/parameters/utils/parameter-source";
import { ParameterWithTemplateTagTarget } from "metabase-lib/parameters/types";
import { fetchParameterValues, FetchParameterValuesOpts } from "../../actions";
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

interface ModalOwnProps {
  parameter: ParameterWithTemplateTagTarget;
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
}

interface ModalDispatchProps {
  onFetchParameterValues: (
    opts: FetchParameterValuesOpts,
  ) => Promise<ParameterValues>;
}

type ModalProps = ModalOwnProps &
  ModalCardProps &
  ModalStateProps &
  ModalDispatchProps;

const ValuesSourceTypeModal = ({
  parameter,
  question,
  sourceType,
  sourceConfig,
  onFetchParameterValues,
  onChangeSourceType,
  onChangeSourceConfig,
  onChangeCard,
  onSubmit,
  onClose,
}: ModalProps): JSX.Element => {
  return (
    <ModalContent
      title={t`Selectable values for ${parameter.name}`}
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
          parameter={parameter}
          sourceType={sourceType}
          sourceConfig={sourceConfig}
          onFetchParameterValues={onFetchParameterValues}
          onChangeSourceType={onChangeSourceType}
          onChangeSourceConfig={onChangeSourceConfig}
        />
      ) : sourceType === "card" ? (
        <CardSourceModal
          parameter={parameter}
          question={question}
          sourceType={sourceType}
          sourceConfig={sourceConfig}
          onFetchParameterValues={onFetchParameterValues}
          onChangeCard={onChangeCard}
          onChangeSourceType={onChangeSourceType}
          onChangeSourceConfig={onChangeSourceConfig}
        />
      ) : sourceType === "static-list" ? (
        <ListSourceModal
          parameter={parameter}
          sourceType={sourceType}
          sourceConfig={sourceConfig}
          onChangeSourceType={onChangeSourceType}
          onChangeSourceConfig={onChangeSourceConfig}
        />
      ) : null}
    </ModalContent>
  );
};

interface SourceTypeOptionsProps {
  parameter: Parameter;
  parameterValues?: ParameterValue[];
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
}

const SourceTypeOptions = ({
  parameter,
  parameterValues = [],
  sourceType,
  sourceConfig,
  onChangeSourceType,
  onChangeSourceConfig,
}: SourceTypeOptionsProps) => {
  const sourceTypeOptions = useMemo(() => {
    return getSourceTypeOptions(parameter);
  }, [parameter]);

  const handleSourceTypeChange = useCallback(
    (sourceType: ValuesSourceType) => {
      onChangeSourceType(sourceType);

      if (parameterValues.length > 0) {
        const values = getSourceValues(parameterValues);
        onChangeSourceConfig({ ...sourceConfig, values });
      }
    },
    [sourceConfig, parameterValues, onChangeSourceType, onChangeSourceConfig],
  );

  return (
    <Radio
      value={sourceType}
      options={sourceTypeOptions}
      vertical
      onChange={handleSourceTypeChange}
    />
  );
};

interface FieldSourceModalProps {
  parameter: Parameter;
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  onFetchParameterValues: (
    opts: FetchParameterValuesOpts,
  ) => Promise<ParameterValues>;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
}

const FieldSourceModal = ({
  parameter,
  sourceType,
  sourceConfig,
  onFetchParameterValues,
  onChangeSourceType,
  onChangeSourceConfig,
}: FieldSourceModalProps) => {
  const { values, isLoading } = useParameterValues({
    parameter,
    sourceType,
    sourceConfig,
    onFetchParameterValues,
  });

  const valuesText = useMemo(
    () => getValuesText(getSourceValues(values)),
    [values],
  );

  const hasFields = getFields(parameter).length > 0;
  const hasEmptyValues = !isLoading && values.length === 0;

  return (
    <ModalBodyWithPane>
      <ModalPane>
        <ModalSection>
          <ModalLabel>{t`Where values should come from`}</ModalLabel>
          <SourceTypeOptions
            parameter={parameter}
            parameterValues={values}
            sourceType={sourceType}
            sourceConfig={sourceConfig}
            onChangeSourceType={onChangeSourceType}
            onChangeSourceConfig={onChangeSourceConfig}
          />
        </ModalSection>
      </ModalPane>
      <ModalMain>
        {!hasFields ? (
          <ModalEmptyState>
            {t`You haven’t connected a field to this filter yet, so there aren’t any values.`}
          </ModalEmptyState>
        ) : hasEmptyValues ? (
          <ModalEmptyState>
            {t`We don’t have any cached values for the connected fields. Try one of the other options, or change this widget to a search box.`}
          </ModalEmptyState>
        ) : (
          <ModalTextArea value={valuesText} readOnly fullWidth />
        )}
      </ModalMain>
    </ModalBodyWithPane>
  );
};

interface CardSourceModalProps {
  parameter: Parameter;
  question: Question | undefined;
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  onFetchParameterValues: (
    opts: FetchParameterValuesOpts,
  ) => Promise<ParameterValues>;
  onChangeCard: () => void;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
}

const CardSourceModal = ({
  parameter,
  question,
  sourceType,
  sourceConfig,
  onFetchParameterValues,
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

  const { values, isError } = useParameterValues({
    parameter,
    sourceType,
    sourceConfig,
    onFetchParameterValues,
  });

  const valuesText = useMemo(
    () => getValuesText(getSourceValues(values)),
    [values],
  );

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
          <SourceTypeOptions
            parameter={parameter}
            parameterValues={values}
            sourceType={sourceType}
            sourceConfig={sourceConfig}
            onChangeSourceType={onChangeSourceType}
            onChangeSourceConfig={onChangeSourceConfig}
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
        ) : isError ? (
          <ModalEmptyState>{t`An error occurred in your query`}</ModalEmptyState>
        ) : (
          <ModalTextArea value={valuesText} readOnly fullWidth />
        )}
      </ModalMain>
    </ModalBodyWithPane>
  );
};

interface ListSourceModalProps {
  parameter: Parameter;
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
}

const ListSourceModal = ({
  parameter,
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
          <SourceTypeOptions
            parameter={parameter}
            sourceType={sourceType}
            sourceConfig={sourceConfig}
            onChangeSourceType={onChangeSourceType}
            onChangeSourceConfig={onChangeSourceConfig}
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

const getValuesText = (values: string[] = []) => {
  return values.join(NEW_LINE);
};

const getSourceValues = (values: ParameterValue[] = []) => {
  return values.map(([value]) => String(value));
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

const getSourceTypeOptions = (
  parameter: ParameterWithTemplateTagTarget,
): RadioOption<ValuesSourceType>[] => {
  return [
    ...(parameter.hasVariableTemplateTagTarget
      ? []
      : [{ name: t`From connected fields`, value: null }]),
    { name: t`From another model or question`, value: "card" },
    { name: t`Custom list`, value: "static-list" },
  ];
};

interface ParameterValuesState {
  values: ParameterValue[];
  isLoading?: boolean;
  isError?: boolean;
}

interface UseParameterValuesOpts {
  parameter: Parameter;
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  onFetchParameterValues: (
    opts: FetchParameterValuesOpts,
  ) => Promise<ParameterValues>;
}

const useParameterValues = ({
  parameter: initialParameter,
  sourceType,
  sourceConfig,
  onFetchParameterValues,
}: UseParameterValuesOpts) => {
  const [state, setState] = useState<ParameterValuesState>({ values: [] });
  const handleFetchValues = useSafeAsyncFunction(onFetchParameterValues);
  const isValidSource = isValidSourceConfig(sourceType, sourceConfig);

  const parameter = useMemo(
    () => ({
      ...initialParameter,
      values_source_type: sourceType,
      values_source_config: sourceConfig,
    }),
    [initialParameter, sourceType, sourceConfig],
  );

  useLayoutEffect(() => {
    if (isValidSource) {
      setState(({ values }) => ({ values, isLoading: true }));

      handleFetchValues({ parameter })
        .then(({ values }) => setState({ values }))
        .catch(() => setState({ values: [], isError: true }));
    }
  }, [parameter, isValidSource, handleFetchValues]);

  return state;
};

const mapStateToProps = (
  state: State,
  { card }: ModalOwnProps & ModalCardProps,
): ModalStateProps => ({
  question: card ? new Question(card, getMetadata(state)) : undefined,
});

const mapDispatchToProps = {
  onFetchParameterValues: fetchParameterValues,
};

export default _.compose(
  Tables.load({
    id: (state: State, { sourceConfig: { card_id } }: ModalOwnProps) =>
      card_id ? getQuestionVirtualTableId(card_id) : undefined,
    fetchType: "fetchMetadata",
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
