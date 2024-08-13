import type { ChangeEvent } from "react";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import _ from "underscore";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink";
import type { RadioOption } from "metabase/core/components/Radio";
import Radio from "metabase/core/components/Radio";
import type { SelectChangeEvent } from "metabase/core/components/Select";
import Select, { Option } from "metabase/core/components/Select";
import SelectButton from "metabase/core/components/SelectButton";
import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";
import { useSelector } from "metabase/lib/redux";
import { getLearnUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Box, Flex, Icon } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Field from "metabase-lib/v1/metadata/Field";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { hasFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import { isValidSourceConfig } from "metabase-lib/v1/parameters/utils/parameter-source";
import {
  getParameterType,
  isNumberParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  ValuesSourceConfig,
  ValuesSourceType,
  Parameter,
  ParameterValues,
  ParameterValue,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { FetchParameterValuesOpts } from "../../actions";
import { fetchParameterValues } from "../../actions";

import { ModalLoadingAndErrorWrapper } from "./ValuesSourceModal.styled";
import S from "./ValuesSourceTypeModal.module.css";
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
import { getValuesText, getStaticValues } from "./utils";

interface ModalOwnProps {
  parameter: UiParameter;
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onChangeCard: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

interface ModalQuestionProps {
  question: Question | undefined;
}

interface ModalDispatchProps {
  onFetchParameterValues: (
    opts: FetchParameterValuesOpts,
  ) => Promise<ParameterValues>;
}

type ModalProps = ModalOwnProps & ModalQuestionProps & ModalDispatchProps;

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
          // if sourceType === null the parameter must have fields
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
  parameter: UiParameter;
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
  parameter: UiParameter;
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
        {hasEmptyValues ? (
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
    return question ? getSupportedFields(question, parameter) : [];
  }, [question, parameter]);

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
                {getErrorMessage(question, parameter)}{" "}
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

const getErrorMessage = (question: Question, parameter: Parameter) => {
  const parameterType = getParameterType(parameter);
  const type = question.type();

  if (parameterType === "number") {
    if (type === "question") {
      return t`This question doesn’t have any number columns.`;
    }

    if (type === "model") {
      return t`This model doesn’t have any number columns.`;
    }
  }

  if (type === "question") {
    return t`This question doesn’t have any text columns.`;
  }

  if (type === "model") {
    return t`This model doesn’t have any text columns.`;
  }

  throw new Error(`Unsupported or unknown question.type(): ${type}`);
};

const getLabel = (value: string | ParameterValue): string | undefined =>
  Array.isArray(value) ? value[1] : undefined;

const valueHasLabel = (value: string | ParameterValue) =>
  getLabel(value) !== undefined;

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

  const hasCustomLabels = sourceConfig.values?.some(valueHasLabel);

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
          <ModalHelpMessage>{t`Enter one value per line. You can optionally give each value a display label after a comma.`}</ModalHelpMessage>

          {hasCustomLabels && <ModelHint />}
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

function ModelHint() {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  const href = getLearnUrl("learn/data-modeling/models");
  const text = t`do it once in a model`;
  const link = showMetabaseLinks ? (
    <strong>
      <ExternalLink href={href}>{text}</ExternalLink>
    </strong>
  ) : (
    <strong>{text}</strong>
  );

  return (
    <Box mt="lg" p="md" className={S.info}>
      <Flex gap="md" align="center">
        <Icon name="info_filled" color="text-dark" className={S.icon} />
        <div>
          {jt`If you find yourself doing value-label mapping often, you might want to ${link}.`}
        </div>
      </Flex>
    </Box>
  );
}

const getSourceValues = (values: ParameterValue[] = []) => {
  return values.map(([value]) => String(value));
};

const getFieldByReference = (fields: Field[], fieldReference?: unknown[]) => {
  return fields.find(field => _.isEqual(field.reference(), fieldReference));
};

const getFieldFilter = (parameter: Parameter) => {
  const type = getParameterType(parameter);
  if (type === "number") {
    return (field: Field) => field.isNumeric();
  }
  return (field: Field) => field.isString();
};

const getSupportedFields = (question: Question, parameter: Parameter) => {
  const fieldFilter = getFieldFilter(parameter);
  const fields =
    question.composeQuestionAdhoc().legacyQueryTable()?.fields ?? [];
  return fields.filter(fieldFilter);
};

/**
 * if !hasFields(parameter) then exclude the option to set the source type to
 * "From connected fields" i.e. values_source_type=null
 */
const getSourceTypeOptions = (
  parameter: UiParameter,
): RadioOption<ValuesSourceType>[] => {
  return [
    ...(hasFields(parameter)
      ? [{ name: t`From connected fields`, value: null }]
      : []),
    ...(isNumberParameter(parameter)
      ? []
      : ([
          { name: t`From another model or question`, value: "card" },
        ] as const)),
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

const mapDispatchToProps = {
  onFetchParameterValues: fetchParameterValues,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Tables.load({
    id: (state: State, { sourceConfig: { card_id } }: ModalOwnProps) =>
      card_id ? getQuestionVirtualTableId(card_id) : undefined,
    fetchType: "fetchMetadataDeprecated",
    requestType: "fetchMetadataDeprecated",
    LoadingAndErrorWrapper: ModalLoadingAndErrorWrapper,
  }),
  Questions.load({
    id: (state: State, { sourceConfig: { card_id } }: ModalOwnProps) => card_id,
    LoadingAndErrorWrapper: ModalLoadingAndErrorWrapper,
  }),
  connect(null, mapDispatchToProps),
)(ValuesSourceTypeModal);
