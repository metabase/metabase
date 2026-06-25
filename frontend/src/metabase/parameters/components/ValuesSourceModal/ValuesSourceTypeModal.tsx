import type { ChangeEvent, ReactNode } from "react";
import { useCallback, useLayoutEffect, useMemo } from "react";
import { useAsyncFn } from "react-use";
import { jt, t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ModalContent } from "metabase/common/components/ModalContent";
import type { SelectChangeEvent } from "metabase/common/components/Select";
import { Option, Select } from "metabase/common/components/Select";
import { SelectButton } from "metabase/common/components/SelectButton";
import { connect, useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getLearnUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Box, Button, Flex, Icon, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { hasFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import {
  getQueryType,
  isValidSourceConfig,
} from "metabase-lib/v1/parameters/utils/parameter-source";
import {
  getParameterType,
  isNumberParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  FieldReference,
  Parameter,
  ParameterValue,
  ParameterValues,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";

import type { FetchParameterValuesOpts } from "../../actions";
import { fetchParameterValues } from "../../actions";

import S from "./ValuesSourceTypeModal.module.css";
import {
  ModalBodyWithPane,
  ModalEmptyState,
  ModalErrorMessage,
  ModalHelpMessage,
  ModalLabel,
  ModalLoadingAndErrorWrapper,
  ModalMain,
  ModalPane,
  ModalSection,
  ModalTextArea,
} from "./ValuesSourceTypeModalComponents";
import { getStaticValues, getValuesText } from "./utils";

const STAGE_INDEX = 0;
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
          variant="filled"
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

type SourceTypeOption = {
  name: string;
  value: ValuesSourceType;
};

// Mantine's Radio.Group only handles string values, so the null source type
// ("From connected fields") is mapped to a sentinel string.
const CONNECTED_FIELDS_SENTINEL_VALUE = "connected-fields";

const serializeSourceType = (sourceType: ValuesSourceType): string =>
  sourceType ?? CONNECTED_FIELDS_SENTINEL_VALUE;

const deserializeSourceType = (value: string): ValuesSourceType =>
  value === CONNECTED_FIELDS_SENTINEL_VALUE
    ? null
    : (value as ValuesSourceType);

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
    <Radio.Group
      value={serializeSourceType(sourceType)}
      onChange={(value) => handleSourceTypeChange(deserializeSourceType(value))}
    >
      <Stack gap="sm">
        {sourceTypeOptions.map((option) => (
          <Radio
            key={serializeSourceType(option.value)}
            value={serializeSourceType(option.value)}
            label={option.name}
          />
        ))}
      </Stack>
    </Radio.Group>
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
  const query = useMemo(() => {
    return question != null ? getQuestionBasedQuery(question) : undefined;
  }, [question]);

  const columns = useMemo(() => {
    return query != null ? getSupportedColumns(query, parameter) : [];
  }, [query, parameter]);

  const labelColumns = useMemo(() => {
    return query != null ? getLabelColumns(query) : [];
  }, [query]);

  const selectedField = useMemo(() => {
    return query != null && sourceConfig.value_field != null
      ? getColumnByReference(query, columns, sourceConfig.value_field)
      : undefined;
  }, [query, columns, sourceConfig.value_field]);

  const selectedLabelField = useMemo(() => {
    return query != null && sourceConfig.label_field != null
      ? getColumnByReference(query, labelColumns, sourceConfig.label_field)
      : undefined;
  }, [query, labelColumns, sourceConfig.label_field]);

  const { values, isError } = useParameterValues({
    parameter,
    sourceType,
    sourceConfig,
    onFetchParameterValues,
  });

  const valuesText = useMemo(() => getValuesText(values), [values]);

  const handleValueFieldChange = useCallback(
    (column: Lib.ColumnMetadata | undefined) => {
      if (query == null || column == null) {
        return;
      }
      onChangeSourceConfig({
        ...sourceConfig,
        value_field: Lib.legacyRef(query, STAGE_INDEX, column),
      });
    },
    [query, sourceConfig, onChangeSourceConfig],
  );

  const handleLabelFieldChange = useCallback(
    (column: Lib.ColumnMetadata | undefined) => {
      if (query == null) {
        return;
      }
      onChangeSourceConfig({
        ...sourceConfig,
        label_field:
          column != null
            ? Lib.legacyRef(query, STAGE_INDEX, column)
            : undefined,
      });
    },
    [query, sourceConfig, onChangeSourceConfig],
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
        {question && query != null && (
          <>
            <ColumnSelect
              query={query}
              columns={columns}
              selectedColumn={selectedField}
              label={t`Column to supply the values`}
              placeholder={t`Pick a column…`}
              emptyMessage={
                <>
                  {getErrorMessage(question, parameter)}{" "}
                  {t`Please pick a different model or question.`}
                </>
              }
              onChange={handleValueFieldChange}
            />
            {selectedField != null && labelColumns.length > 0 && (
              <ColumnSelect
                query={query}
                columns={labelColumns}
                selectedColumn={selectedLabelField}
                label={t`Column to supply the labels`}
                placeholder={t`Pick a column…`}
                withNoneOption
                onChange={handleLabelFieldChange}
              />
            )}
          </>
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

interface ColumnSelectProps {
  query: Lib.Query;
  columns: Lib.ColumnMetadata[];
  selectedColumn: Lib.ColumnMetadata | undefined;
  label: string;
  placeholder: string;
  emptyMessage?: ReactNode;
  withNoneOption?: boolean;
  onChange: (column: Lib.ColumnMetadata | undefined) => void;
}

const ColumnSelect = ({
  query,
  columns,
  selectedColumn,
  label,
  placeholder,
  emptyMessage,
  withNoneOption,
  onChange,
}: ColumnSelectProps) => {
  const handleChange = useCallback(
    (event: SelectChangeEvent<Lib.ColumnMetadata | undefined>) => {
      onChange(event.target.value);
    },
    [onChange],
  );

  return (
    <ModalSection>
      <ModalLabel>{label}</ModalLabel>
      {columns.length > 0 ? (
        <Select
          value={selectedColumn}
          placeholder={placeholder}
          onChange={handleChange}
        >
          {[
            ...(withNoneOption
              ? [<Option key="none" name={t`None`} value={undefined} />]
              : []),
            ...columns.map((column, index) => (
              <Option
                key={index}
                name={Lib.displayInfo(query, STAGE_INDEX, column).displayName}
                value={column}
              />
            )),
          ]}
        </Select>
      ) : emptyMessage != null ? (
        <ModalErrorMessage>{emptyMessage}</ModalErrorMessage>
      ) : null}
    </ModalSection>
  );
};

const getErrorMessage = (question: Question, parameter: Parameter) => {
  // avoids using the sectionId to determine the parameter type
  const parameterType = getParameterType(parameter.type);
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

  const href = getLearnUrl("metabase-basics/getting-started/models");
  const text = t`do it once in a model`;
  const link = showMetabaseLinks ? (
    <strong key="link">
      <ExternalLink href={href}>{text}</ExternalLink>
    </strong>
  ) : (
    <strong key="text">{text}</strong>
  );

  return (
    <Box mt="lg" p="md" className={S.info}>
      <Flex gap="md" align="center">
        <Icon name="info" c="text-primary" className={S.icon} />
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

const getQuestionBasedQuery = (question: Question) => {
  const adhocQuestion = question.composeQuestion();
  return adhocQuestion.query();
};

const getColumnByReference = (
  query: Lib.Query,
  columns: Lib.ColumnMetadata[],
  columnRef: FieldReference,
) => {
  const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(query, 0, columns, [
    columnRef,
  ]);
  return columns[columnIndex];
};

const getSupportedColumns = (query: Lib.Query, parameter: Parameter) => {
  // avoids using the sectionId to determine the parameter type
  const type = getParameterType(parameter.type);
  return Lib.fieldableColumns(query, 0).filter((column) => {
    if (type === "number") {
      return Lib.isNumeric(column);
    }
    return Lib.isStringOrStringLike(column);
  });
};

// Labels used for remapping are always text, regardless of the parameter type.
const getLabelColumns = (query: Lib.Query) => {
  return Lib.fieldableColumns(query, 0).filter((column) =>
    Lib.isStringOrStringLike(column),
  );
};

/**
 * if !hasFields(parameter) then exclude the option to set the source type to
 * "From connected fields" i.e. values_source_type=null
 */
const getSourceTypeOptions = (parameter: UiParameter): SourceTypeOption[] => {
  return [
    ...(hasFields(parameter)
      ? [{ name: t`From connected fields`, value: null }]
      : []),
    ...(isNumberParameter(parameter) && getQueryType(parameter) === "search"
      ? []
      : ([
          { name: t`From another model or question`, value: "card" },
        ] as const)),
    { name: t`Custom list`, value: "static-list" },
  ];
};

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
  const isValidSource = isValidSourceConfig(sourceType, sourceConfig);

  const parameter = useMemo(
    () => ({
      ...initialParameter,
      values_source_type: sourceType,
      values_source_config: sourceConfig,
    }),
    [initialParameter, sourceType, sourceConfig],
  );

  const [{ loading, error, value }, handleFetchValues] = useAsyncFn(
    () => onFetchParameterValues({ parameter }),
    [onFetchParameterValues, parameter],
  );

  useLayoutEffect(() => {
    if (isValidSource) {
      handleFetchValues();
    }
  }, [isValidSource, handleFetchValues]);

  return {
    values: value?.values ?? [],
    isLoading: loading,
    isError: !!error,
  };
};

const mapDispatchToProps = {
  onFetchParameterValues: fetchParameterValues,
};

const ValuesSourceTypeModalConnected = connect(
  null,
  mapDispatchToProps,
)(ValuesSourceTypeModal);

// Loads the source card and its virtual-table query metadata into the store (so
// the question and its connected fields are available) before rendering,
// replacing the former Questions.load / Tables.load HOCs.
function ValuesSourceTypeModalLoader(props: ModalOwnProps) {
  const { card_id } = props.sourceConfig;
  const virtualTableId =
    card_id != null ? getQuestionVirtualTableId(card_id) : undefined;
  const { isLoading: isMetadataLoading, error: metadataError } =
    useGetTableQueryMetadataQuery(
      virtualTableId != null ? { id: virtualTableId } : skipToken,
    );
  const { isLoading: isCardLoading, error: cardError } = useGetCardQuery(
    card_id != null ? { id: card_id } : skipToken,
  );
  const question = useSelector((state) =>
    card_id != null
      ? (getMetadata(state).question(card_id) ?? undefined)
      : undefined,
  );

  return (
    <ModalLoadingAndErrorWrapper
      loading={isMetadataLoading || isCardLoading}
      error={metadataError ?? cardError}
      noWrapper
    >
      <ValuesSourceTypeModalConnected {...props} question={question} />
    </ModalLoadingAndErrorWrapper>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ValuesSourceTypeModalLoader;
