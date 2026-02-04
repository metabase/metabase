import cx from "classnames";
import {
  type StyleHTMLAttributes,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMount, usePrevious } from "react-use";
import { jt, t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  skipToken,
  useGetRemappedCardParameterValueQuery,
  useGetRemappedDashboardParameterValueQuery,
  useGetRemappedParameterValueQuery,
} from "metabase/api";
import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { LoadingSpinner } from "metabase/common/components/LoadingSpinner";
import {
  TokenField,
  parseStringValue,
} from "metabase/common/components/TokenField";
import type { LayoutRendererArgs } from "metabase/common/components/TokenField/TokenField";
import CS from "metabase/css/core/index.css";
import { useEmbeddingEntityContext } from "metabase/embedding/context";
import { Fields } from "metabase/entities/fields";
import { useTranslateContent } from "metabase/i18n/hooks";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { parseNumber } from "metabase/lib/number";
import { connect, useDispatch } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import {
  fetchCardParameterValues,
  fetchDashboardParameterValues,
  fetchParameterValues,
} from "metabase/parameters/actions";
import { addRemappings } from "metabase/redux/metadata";
import {
  type ComboboxItem,
  Loader,
  MultiAutocomplete,
  MultiAutocompleteOption,
  MultiAutocompleteValue,
} from "metabase/ui";
import Field from "metabase-lib/v1/metadata/Field";
import { getSourceType } from "metabase-lib/v1/parameters/utils/parameter-source";
import { normalizeParameter } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  CardId,
  DashboardId,
  FieldValue,
  Parameter,
  ParameterValueOrArray,
  RowValue,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { Value as ValueComponent } from "../Value";

import { OptionsMessage, StyledEllipsified } from "./FieldValuesWidget.styled";
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
  isSearchable,
  shouldList,
} from "./utils";

const MAX_SEARCH_RESULTS = 100;
const COMBOBOX_WIDTH = 364;
const DROPDOWN_WIDTH = 314;

function mapStateToProps(state: State, { fields = [] }: { fields: Field[] }) {
  return {
    fields: fields.map(
      (field) =>
        Fields.selectors.getObject(state, { entityId: field.id }) || field,
    ),
  };
}

export interface IFieldValuesWidgetProps {
  color?: "brand";
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
  alwaysShowOptions?: boolean;
  showOptionsInPopover?: boolean;

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

  valueRenderer?: (value: string | number) => JSX.Element;
  optionRenderer?: (option: FieldValue) => JSX.Element;
  layoutRenderer?: (props: LayoutRendererArgs) => JSX.Element;
}

export const FieldValuesWidgetInner = forwardRef<
  HTMLDivElement,
  IFieldValuesWidgetProps
>(function FieldValuesWidgetInner(
  {
    color,
    maxResults = MAX_SEARCH_RESULTS,
    alwaysShowOptions = true,
    style = {},
    formatOptions = {},
    containerWidth,
    maxWidth = 500,
    minWidth,
    width,
    disableList = false,
    disableSearch = false,
    disablePKRemappingForSearch,
    showOptionsInPopover = false,
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
    valueRenderer,
    optionRenderer,
    layoutRenderer,
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
      fields.forEach((field) => dispatch(addRemappings(field.id, options)));
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

  if (!valueRenderer) {
    valueRenderer = (value: string | number) => {
      const option = options.find((option) => getValue(option) === value);
      return renderValue({
        fields,
        formatOptions,
        value,
        parameter,
        cardId,
        dashboardId,
        autoLoad: true,
        compact: false,
        displayValue: option?.[1],
      });
    };
  }

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

  if (!layoutRenderer) {
    layoutRenderer = showOptionsInPopover
      ? undefined
      : ({
          optionsList,
          isFocused,
          isAllSelected,
          isFiltered,
          valuesList,
        }: LayoutRendererArgs) => (
          <div>
            {valuesList}
            {renderOptions({
              alwaysShowOptions,
              parameter,
              fields,
              disableSearch,
              disablePKRemappingForSearch,
              loadingState,
              options,
              valuesMode,
              optionsList,
              isFocused,
              isAllSelected,
              isFiltered,
            })}
          </div>
        );
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
          <MultiAutocomplete
            value={value.filter(isNotNull).map((value) => String(value))}
            data={options
              .filter((option) => getValue(option) != null)
              .map((option) => getOption(option))
              .filter(isNotNull)}
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
            parseValue={(value) => {
              if (isNumericParameter) {
                const number = parseNumber(value);
                return number != null ? String(number) : null;
              } else {
                const string = value.trim();
                return string.length > 0 ? string : null;
              }
            }}
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
            onChange={(values) => {
              if (isNumericParameter) {
                onChange(values.map(parseNumericValue));
              } else {
                onChange(values);
              }
            }}
            onSearchChange={onInputChange}
          />
        ) : (
          <TokenField
            value={value.filter((v) => v != null)}
            onChange={onChange}
            placeholder={tokenFieldPlaceholder}
            updateOnInputChange
            // forwarded props
            multi={multi}
            autoFocus={autoFocus}
            color={color}
            style={{ ...style, minWidth: "inherit" }}
            className={className}
            optionsStyle={
              !parameter && !showOptionsInPopover ? { maxHeight: "none" } : {}
            }
            // end forwarded props
            options={options}
            valueKey="0"
            valueRenderer={valueRenderer}
            optionRenderer={optionRenderer}
            layoutRenderer={layoutRenderer}
            filterOption={(option, filterString) => {
              const lowerCaseFilterString = filterString.toLowerCase();
              return option?.some?.(
                (value) =>
                  value != null &&
                  String(value).toLowerCase().includes(lowerCaseFilterString),
              );
            }}
            onInputChange={onInputChange}
            parseFreeformValue={parseFreeformValue}
            updateOnInputBlur
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
    <LoadingSpinner size={16} />
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

const NoMatchState = ({ fields }: { fields: (Field | null)[] }) => {
  if (fields.length === 1 && !!fields[0]) {
    const [{ display_name }] = fields;

    return (
      <OptionsMessage>
        {jt`No matching ${(
          <StyledEllipsified key={display_name}>
            {display_name}
          </StyledEllipsified>
        )} found.`}
      </OptionsMessage>
    );
  }

  return <OptionsMessage>{t`No matching result`}</OptionsMessage>;
};

const EveryOptionState = () => (
  <OptionsMessage>{t`Including every option in your filter probably won’t do much…`}</OptionsMessage>
);

interface RenderOptionsProps {
  alwaysShowOptions: boolean;
  parameter?: Parameter;
  fields: Field[];
  disableSearch: boolean;
  disablePKRemappingForSearch?: boolean;
  loadingState: LoadingStateType;
  options: FieldValue[];
  valuesMode: ValuesMode;
  optionsList: React.ReactNode;
  isFocused: boolean;
  isAllSelected: boolean;
  isFiltered: boolean;
}

function renderOptions({
  alwaysShowOptions,
  parameter,
  fields,
  disableSearch,
  disablePKRemappingForSearch,
  loadingState,
  options,
  valuesMode,
  optionsList,
  isFocused,
  isAllSelected,
  isFiltered,
}: RenderOptionsProps) {
  if (alwaysShowOptions || isFocused) {
    if (optionsList) {
      return optionsList;
    } else if (
      hasList({
        parameter,
        fields,
        disableSearch,
        options,
      }) &&
      valuesMode === "list"
    ) {
      if (isAllSelected) {
        return <EveryOptionState />;
      }
    } else if (
      isSearchable({
        parameter,
        fields,
        disableSearch,
        disablePKRemappingForSearch,
        valuesMode,
      })
    ) {
      if (loadingState === "LOADING") {
        return <LoadingState />;
      } else if (loadingState === "LOADED" && isFiltered) {
        return (
          <NoMatchState
            fields={fields.map(
              (field) =>
                field.searchField(disablePKRemappingForSearch) as Field | null,
            )}
          />
        );
      }
    }
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

  const isRemapped =
    Field.remappedField(fields) != null ||
    getSourceType(parameter) === "static-list";

  const { data: dashboardData } = useGetRemappedDashboardParameterValueQuery(
    dashboardId != null && value != null && isRemapped
      ? {
          ...(entityIdentifier
            ? { entityIdentifier }
            : { dashboard_id: dashboardId }),
          parameter_id: parameter.id,
          value,
        }
      : skipToken,
  );

  const { data: cardData } = useGetRemappedCardParameterValueQuery(
    cardId != null && value != null && isRemapped
      ? {
          ...(entityIdentifier ? { entityIdentifier } : { card_id: cardId }),
          parameter_id: parameter.id,
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
  option: ComboboxItem;
  fields: Field[];
  tc: ContentTranslationFunction;
};

function RemappedOption({ option, fields, tc }: RemappedOptionProps) {
  const isRemapped = Field.remappedField(fields) != null;
  if (!isRemapped) {
    return tc(option.label);
  }

  return (
    <MultiAutocompleteOption value={option.value} label={tc(option.label)} />
  );
}
