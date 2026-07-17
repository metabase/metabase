import cx from "classnames";
import {
  type KeyboardEvent,
  type StyleHTMLAttributes,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useMount, usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  skipToken,
  useGetRemappedCardParameterValueQuery,
  useGetRemappedDashboardParameterValueQuery,
  useGetRemappedParameterValueQuery,
} from "metabase/api";
import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { MultiAutocompleteWithTranslation } from "metabase/common/components/MultiAutocomplete";
import { useTranslateContent } from "metabase/content-translation/hooks";
import type { ContentTranslationFunction } from "metabase/content-translation/types";
import CS from "metabase/css/core/index.css";
import { useEmbeddingEntityContext } from "metabase/embedding/context";
import {
  fetchCardParameterValues,
  fetchDashboardParameterValues,
  fetchParameterValues,
} from "metabase/parameters/actions";
import { connect, useDispatch } from "metabase/redux";
import { addRemappings } from "metabase/redux/remappings";
import type { State } from "metabase/redux/store";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Autocomplete,
  Loader,
  MultiAutocompleteOption,
  MultiAutocompleteValue,
  SelectItem,
} from "metabase/ui";
import { parseNumber } from "metabase/utils/number";
import { isNotNull } from "metabase/utils/types";
import Field from "metabase-lib/v1/metadata/Field";
import { hasRemappedParameterValues } from "metabase-lib/v1/parameters/utils/parameter-source";
import { normalizeParameter } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  CardId,
  DashboardId,
  FieldValue,
  Parameter,
  ParameterValueOrArray,
  RowValue,
} from "metabase-types/api";

import { Value as ValueComponent } from "../Value";

import { ListField } from "./ListField";
import SingleSelectListField from "./SingleSelectListField";
import type { LoadingStateType, ValuesMode } from "./types";
import {
  canUseCardEndpoints,
  canUseDashboardEndpoints,
  canUseParameterEndpoints,
  getLabel,
  getOption,
  getTokenFieldPlaceholder,
  getValue,
  getValuesMode,
  hasList,
  isExtensionOfPreviousSearch,
  isNumeric,
  parseStringValue,
  shouldList,
} from "./utils";

const MAX_SEARCH_RESULTS = 100;
const COMBOBOX_WIDTH = 364;
const DROPDOWN_WIDTH = 314;

function mapStateToProps(state: State, { fields = [] }: { fields: Field[] }) {
  const metadata = getMetadata(state);
  return {
    fields: fields.map((field) => metadata.field(field.id) || field),
  };
}

export interface IFieldValuesWidgetProps {
  maxResults?: number;
  style?: StyleHTMLAttributes<HTMLDivElement>;
  formatOptions?: Record<string, any>;

  containerWidth?: number | string;
  maxWidth?: number | null;
  minWidth?: number | null;
  width?: number | null;

  disableList?: boolean;
  disableSearch?: boolean;
  disablePKRemappingForSearch?: boolean;

  parameter: Parameter;
  parameters?: Parameter[]; // linked parameters with values
  fields: Field[];
  dashboardId?: DashboardId;
  cardId?: CardId;

  value: RowValue[];
  onChange: (value: RowValue[]) => void;

  multi?: boolean;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
  checkedColor?: string;

  optionRenderer?: (option: FieldValue) => JSX.Element;
}

export const FieldValuesWidgetInner = forwardRef<
  HTMLDivElement,
  IFieldValuesWidgetProps
>(function FieldValuesWidgetInner(
  {
    maxResults = MAX_SEARCH_RESULTS,
    formatOptions = {},
    containerWidth,
    maxWidth = 500,
    minWidth,
    width,
    disableList = false,
    disableSearch = false,
    disablePKRemappingForSearch,
    parameter,
    parameters,
    fields,
    dashboardId,
    cardId,
    value,
    onChange,
    multi,
    autoFocus,
    className,
    placeholder,
    checkedColor,
    optionRenderer,
  },
  ref,
) {
  const [options, setOptions] = useState<FieldValue[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingStateType>("INIT");
  const [lastValue, setLastValue] = useState<string>("");
  const [valuesMode, setValuesMode] = useState<ValuesMode>(
    getValuesMode({
      parameter,
      fields,
      disableSearch,
      disablePKRemappingForSearch,
    }),
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const dispatch = useDispatch();
  const tc = useTranslateContent();

  const previousWidth = usePrevious(width);

  const { uuid, token } = useEmbeddingEntityContext();
  const entityIdentifier = uuid ?? token ?? null;

  useMount(() => {
    if (shouldList({ parameter, fields, disableSearch })) {
      fetchValues();
    }
  });

  useEffect(() => {
    if (
      typeof width === "number" &&
      typeof previousWidth === "number" &&
      width > previousWidth
    ) {
      setIsExpanded(true);
    }
  }, [width, previousWidth]);

  const fetchValues = async (query?: string) => {
    setLoadingState("LOADING");
    setOptions([]);

    let newOptions: FieldValue[] = [];
    let hasMoreOptions = false;
    try {
      if (canUseDashboardEndpoints(dashboardId)) {
        const result = await dispatchFetchDashboardParameterValues(query);
        newOptions = result.values;
        hasMoreOptions = result.has_more_values;
      } else if (canUseCardEndpoints(cardId)) {
        const result = await dispatchFetchCardParameterValues(query);
        newOptions = result.values;
        hasMoreOptions = result.has_more_values;
      } else if (canUseParameterEndpoints(parameter)) {
        const result = await dispatchFetchParameterValues(query);
        newOptions = result.values;
        hasMoreOptions = result.has_more_values;
      }
    } finally {
      updateRemappings(newOptions);
      setOptions(newOptions);
      setValuesMode(
        hasMoreOptions && !isNumericParameter ? "search" : valuesMode,
      );
      setLoadingState("LOADED");
    }
  };

  const dispatchFetchParameterValues = async (query?: string) => {
    if (!parameter) {
      return { has_more_values: false, values: [] };
    }

    return dispatch(
      fetchParameterValues({
        parameter,
        query,
      }),
    );
  };

  const dispatchFetchCardParameterValues = async (query?: string) => {
    if (!isNotNull(cardId) || !parameter) {
      return { has_more_values: false, values: [] };
    }

    return dispatch(
      fetchCardParameterValues({
        cardId,
        entityIdentifier,
        parameter,
        query,
      }),
    );
  };

  const dispatchFetchDashboardParameterValues = async (query?: string) => {
    if (!isNotNull(dashboardId) || !parameter || !parameters) {
      return { has_more_values: false, values: [] };
    }

    return dispatch(
      fetchDashboardParameterValues({
        dashboardId,
        entityIdentifier,
        parameter,
        parameters,
        query,
      }),
    );
  };

  // ? this may rely on field mutations
  const updateRemappings = (options: FieldValue[]) => {
    if (Field.remappedField(fields) != null) {
      fields.forEach((field) => {
        if (typeof field.id === "number") {
          dispatch(addRemappings(field.id, options));
        }
      });
    }
  };

  const onInputChange = (value: string) => {
    let localValuesMode = valuesMode;

    // override "search" mode when searching is unnecessary
    localValuesMode = isExtensionOfPreviousSearch(
      value,
      lastValue,
      options,
      maxResults,
    )
      ? "list"
      : localValuesMode;

    if (localValuesMode === "search") {
      _search(value);
    }

    return value;
  };

  const search = useRef(
    _.debounce(async (value: string) => {
      if (!value) {
        setOptions([]);
        setLoadingState("LOADED");
        setLastValue(value);
      } else {
        setLoadingState("LOADING");
        await fetchValues(value);
        setLastValue(value);
      }
    }, 500),
  );

  const _search = (value: string) => {
    search.current(value);
  };

  if (!optionRenderer) {
    optionRenderer = (option: FieldValue) =>
      renderValue({
        fields,
        formatOptions,
        value: option[0],
        parameter,
        cardId,
        dashboardId,
        autoLoad: false,
        displayValue: option[1],
      });
  }

  const tokenFieldPlaceholder = getTokenFieldPlaceholder({
    fields,
    parameter,
    disableSearch,
    placeholder,
    disablePKRemappingForSearch,
    options,
    valuesMode,
  });

  const isListMode =
    !disableList &&
    shouldList({ parameter, fields, disableSearch }) &&
    valuesMode === "list";
  const isLoading = loadingState === "LOADING";
  const hasListValues = hasList({
    parameter,
    fields,
    disableSearch,
    options,
  });
  const isNumericParameter = isNumeric(parameter, fields);

  const parseNumericValue = (value: string) => {
    const number = parseNumber(value);
    return typeof number === "bigint" ? String(number) : number;
  };

  const parseFreeformValue = (value: string | undefined) => {
    if (value == null) {
      return null;
    }

    return isNumericParameter
      ? parseNumericValue(value)
      : parseStringValue(value);
  };

  const parseValue = (value: string) =>
    parseFreeformValue(value)?.toString() ?? null;

  const commitValues = (values: string[]) =>
    onChange(isNumericParameter ? values.map(parseNumericValue) : values);

  const fieldValues = value.filter(isNotNull).map(String);
  const optionsData = options.map(getOption).filter(isNotNull);

  const handleSingleValueKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    const inputValue = event.currentTarget.value;
    const firstOption = optionsData[0];
    if (firstOption && firstOption.value !== inputValue) {
      event.preventDefault();
      const form = event.currentTarget.form;
      flushSync(() => commitValues([firstOption.value]));
      form?.requestSubmit();
    }
  };

  return (
    <ErrorBoundary ref={ref}>
      <div
        data-testid="field-values-widget"
        style={{
          width: (isExpanded ? maxWidth : containerWidth) ?? undefined,
          minWidth: minWidth ?? undefined,
          maxWidth: maxWidth ?? undefined,
        }}
        ref={ref}
      >
        {isListMode && isLoading ? (
          <LoadingState />
        ) : isListMode && hasListValues && multi ? (
          <ListField
            isDashboardFilter={!!parameter}
            placeholder={tokenFieldPlaceholder}
            value={value?.filter((v: RowValue) => v != null)}
            onChange={onChange}
            options={options}
            optionRenderer={optionRenderer}
            checkedColor={checkedColor}
          />
        ) : isListMode && hasListValues && !multi ? (
          <SingleSelectListField
            isDashboardFilter={!!parameter}
            placeholder={tokenFieldPlaceholder}
            value={value.filter((v) => v != null)}
            onChange={onChange}
            options={options}
            optionRenderer={optionRenderer}
            checkedColor={checkedColor}
          />
        ) : multi ? (
          <MultiAutocompleteWithTranslation
            value={fieldValues}
            data={optionsData}
            placeholder={tokenFieldPlaceholder}
            rightSection={isLoading ? <Loader size="xs" /> : undefined}
            nothingFoundMessage={getNothingFoundMessage({
              fields,
              loadingState,
              lastValue,
            })}
            autoFocus={autoFocus}
            w={COMBOBOX_WIDTH}
            comboboxProps={{
              width: DROPDOWN_WIDTH,
              position: "bottom-start",
            }}
            data-testid="token-field"
            parseValue={parseValue}
            renderValue={({ value }) => (
              <RemappedValue
                parameter={parameter}
                fields={fields}
                dashboardId={dashboardId}
                cardId={cardId}
                value={isNumericParameter ? parseNumericValue(value) : value}
                tc={tc}
              />
            )}
            renderOption={({ option }) => (
              <RemappedOption option={option} fields={fields} tc={tc} />
            )}
            onChange={commitValues}
            onSearchChange={onInputChange}
          />
        ) : (
          <Autocomplete
            value={fieldValues[0] ?? ""}
            data={optionsData}
            placeholder={tokenFieldPlaceholder}
            rightSection={isLoading ? <Loader size="xs" /> : undefined}
            autoFocus={autoFocus}
            className={className}
            w={COMBOBOX_WIDTH}
            comboboxProps={{
              withinPortal: false,
              floatingStrategy: "fixed",
              width: DROPDOWN_WIDTH,
              position: "bottom-start",
            }}
            data-testid="token-field"
            renderOption={({ option }) => (
              <RemappedOption option={option} fields={fields} tc={tc} />
            )}
            parseValue={parseValue}
            onKeyDown={handleSingleValueKeyDown}
            onSearchChange={onInputChange}
            onChange={(value) => commitValues(value !== "" ? [value] : [])}
          />
        )}
      </div>
    </ErrorBoundary>
  );
});

export const FieldValuesWidget = ExplicitSize<IFieldValuesWidgetProps>()(
  FieldValuesWidgetInner,
);

// eslint-disable-next-line import/no-default-export
export default connect(mapStateToProps, null, null, { forwardRef: true })(
  FieldValuesWidget,
);

const LoadingState = () => (
  <div
    className={cx(CS.flex, CS.layoutCentered, CS.alignCenter)}
    style={{ minHeight: 82 }}
  >
    <Loader size="xs" />
  </div>
);

function getNothingFoundMessage({
  fields,
  loadingState,
  lastValue,
}: {
  fields: (Field | null)[];
  loadingState: LoadingStateType;
  lastValue: string;
}) {
  if (loadingState !== "LOADED" || lastValue.length === 0) {
    return undefined;
  }
  if (fields.length === 1 && fields[0] != null) {
    const [field] = fields;
    const searchField = field.searchField();
    return t`No matching ${searchField?.display_name} found.`;
  } else {
    return t`No matching result`;
  }
}

function renderValue({
  parameter,
  cardId,
  dashboardId,
  fields,
  value,
  formatOptions,
  autoLoad,
  compact,
  displayValue,
}: {
  fields: Field[];
  formatOptions: Record<string, any>;
  value: RowValue;
  parameter?: Parameter;
  cardId?: CardId;
  dashboardId?: DashboardId;
  autoLoad?: boolean;
  compact?: boolean;
  displayValue?: string;
}) {
  return (
    <ValueComponent
      value={value}
      column={fields[0]}
      parameter={parameter}
      cardId={cardId}
      dashboardId={dashboardId}
      maximumFractionDigits={20}
      remap={displayValue || Field.remappedField(fields) != null}
      displayValue={displayValue}
      {...formatOptions}
      autoLoad={autoLoad}
      compact={compact}
    />
  );
}

type RemappedValueProps = {
  parameter: Parameter;
  fields: Field[];
  value: ParameterValueOrArray | null;
  dashboardId?: DashboardId;
  cardId?: CardId;
  tc: ContentTranslationFunction;
};

function RemappedValue({
  parameter,
  fields,
  value,
  dashboardId,
  cardId,
  tc,
}: RemappedValueProps) {
  const { uuid, token } = useEmbeddingEntityContext();
  const entityIdentifier = uuid ?? token ?? null;

  const isRemapped = hasRemappedParameterValues(parameter, fields);

  const { data: dashboardData } = useGetRemappedDashboardParameterValueQuery(
    dashboardId != null && value != null && isRemapped
      ? {
          dashId: dashboardId,
          ...(entityIdentifier && { entityIdentifier }),
          paramId: parameter.id,
          value,
        }
      : skipToken,
  );

  const { data: cardData } = useGetRemappedCardParameterValueQuery(
    cardId != null && value != null && isRemapped
      ? {
          cardId,
          ...(entityIdentifier && { entityIdentifier }),
          paramId: parameter.id,
          value,
        }
      : skipToken,
  );

  const { data: parameterData } = useGetRemappedParameterValueQuery(
    dashboardId == null && cardId == null && value != null && isRemapped
      ? {
          parameter: normalizeParameter(parameter),
          field_ids: fields.map(({ id }) => Number(id)),
          value,
        }
      : skipToken,
  );

  const remappedData = dashboardData ?? cardData ?? parameterData;
  if (remappedData == null) {
    return tc(value);
  }

  const remappedValue = getValue(remappedData);
  const remappedLabel = getLabel(remappedData);
  if (remappedLabel == null) {
    return tc(value);
  }

  return (
    <MultiAutocompleteValue
      value={String(remappedValue)}
      label={tc(String(remappedLabel ?? remappedValue))}
    />
  );
}

type RemappedOptionProps = {
  option: { value: string; label?: string };
  fields: Field[];
  tc: ContentTranslationFunction;
};

function RemappedOption({ option, fields, tc }: RemappedOptionProps) {
  const isRemapped = Field.remappedField(fields) != null;
  const label = tc(option.label ?? option.value);

  return (
    <SelectItem>
      {isRemapped ? (
        <MultiAutocompleteOption value={option.value} label={label} />
      ) : (
        label
      )}
    </SelectItem>
  );
}
