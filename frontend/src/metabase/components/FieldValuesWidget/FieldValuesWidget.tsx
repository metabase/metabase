import { useElementSize } from "@mantine/hooks";
import cx from "classnames";
import type { StyleHTMLAttributes } from "react";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
} from "react";
import { connect } from "react-redux";
import { useMount, usePrevious, useThrottle, useUnmount } from "react-use";
import { jt, t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { ListField } from "metabase/components/ListField";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import SingleSelectListField from "metabase/components/SingleSelectListField";
import TokenField, { parseStringValue } from "metabase/components/TokenField";
import type { LayoutRendererArgs } from "metabase/components/TokenField/TokenField";
import ValueComponent from "metabase/components/Value";
import CS from "metabase/css/core/index.css";
import Fields from "metabase/entities/fields";
import { formatValue } from "metabase/lib/formatting";
import { parseNumberValue } from "metabase/lib/number";
import { defer } from "metabase/lib/promise";
import { useDispatch } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import {
  fetchCardParameterValues,
  fetchDashboardParameterValues,
  fetchParameterValues,
} from "metabase/parameters/actions";
import { addRemappings } from "metabase/redux/metadata";
import type { SelectItemProps } from "metabase/ui";
import { Box, MultiAutocomplete } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Field from "metabase-lib/v1/metadata/Field";
import type {
  Dashboard,
  Parameter,
  FieldValue,
  RowValue,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { OptionsMessage, StyledEllipsified } from "./FieldValuesWidget.styled";
import type { ValuesMode, LoadingStateType } from "./types";
import {
  canUseParameterEndpoints,
  isNumeric,
  hasList,
  isSearchable,
  isExtensionOfPreviousSearch,
  showRemapping,
  getNonVirtualFields,
  dedupeValues,
  searchFieldValues,
  getValuesMode,
  shouldList,
  canUseDashboardEndpoints,
  canUseCardEndpoints,
  getTokenFieldPlaceholder,
  getLabel,
  getValue,
} from "./utils";

const MAX_SEARCH_RESULTS = 100;

function mapStateToProps(state: State, { fields = [] }: { fields: Field[] }) {
  return {
    fields: fields.map(
      field =>
        Fields.selectors.getObject(state, { entityId: field.id }) || field,
    ),
  };
}

export interface IFieldValuesWidgetProps {
  color?: "brand";
  maxResults?: number;
  style?: StyleHTMLAttributes<HTMLDivElement>;
  formatOptions?: Record<string, any>;

  maxWidth?: number | null;
  minWidth?: number | null;

  disableList?: boolean;
  disableSearch?: boolean;
  disablePKRemappingForSearch?: boolean;
  alwaysShowOptions?: boolean;
  showOptionsInPopover?: boolean;

  parameter?: Parameter;
  parameters?: Parameter[];
  fields: Field[];
  dashboard?: Dashboard;
  question?: Question;

  value: RowValue[];
  onChange: (value: RowValue[]) => void;

  multi?: boolean;
  autoFocus?: boolean;
  className?: string;
  prefix?: string;
  placeholder?: string;
  checkedColor?: string;

  valueRenderer?: (value: RowValue) => JSX.Element;
  optionRenderer?: (option: FieldValue) => JSX.Element;
  layoutRenderer?: (props: LayoutRendererArgs) => JSX.Element;
}

export function FieldValuesWidgetInner({
  color,
  maxResults = MAX_SEARCH_RESULTS,
  alwaysShowOptions = true,
  style = {},
  formatOptions = {},
  maxWidth = 500,
  minWidth,
  disableList = false,
  disableSearch = false,
  disablePKRemappingForSearch,
  showOptionsInPopover = false,
  parameter,
  parameters,
  fields,
  dashboard,
  question,
  value,
  onChange,
  multi,
  autoFocus,
  className,
  prefix,
  placeholder,
  checkedColor,
  valueRenderer,
  optionRenderer,
  layoutRenderer,
}: IFieldValuesWidgetProps) {
  const { ref, width: elementWidth } = useElementSize();

  const { width } = useThrottle({
    width: elementWidth,
  });

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

  const previousWidth = usePrevious(width);

  useMount(() => {
    if (shouldList({ parameter, fields, disableSearch })) {
      fetchValues();
    }
  });

  useEffect(() => {
    if (
      typeof previousWidth === "number" &&
      previousWidth !== 0 &&
      width > previousWidth
    ) {
      setIsExpanded(true);
    }
  }, [width, previousWidth]);

  const _cancel = useRef<null | (() => void)>(null);

  useUnmount(() => {
    _cancel?.current?.();
  });

  const fetchValues = async (query?: string) => {
    setLoadingState("LOADING");
    setOptions([]);

    let newOptions: FieldValue[] = [];
    let newValuesMode = valuesMode;
    try {
      if (canUseDashboardEndpoints(dashboard)) {
        const { values, has_more_values } =
          await dispatchFetchDashboardParameterValues(query);
        newOptions = values;
        newValuesMode = has_more_values ? "search" : newValuesMode;
      } else if (canUseCardEndpoints(question)) {
        const { values, has_more_values } =
          await dispatchFetchCardParameterValues(query);
        newOptions = values;
        newValuesMode = has_more_values ? "search" : newValuesMode;
      } else if (canUseParameterEndpoints(parameter)) {
        const { values, has_more_values } = await dispatchFetchParameterValues(
          query,
        );
        newOptions = values;
        newValuesMode = has_more_values ? "search" : newValuesMode;
      } else {
        newOptions = await fetchFieldValues(query);

        newValuesMode = getValuesMode({
          parameter,
          fields,
          disableSearch,
          disablePKRemappingForSearch,
        });
      }
    } finally {
      updateRemappings(newOptions);

      setOptions(newOptions);
      setLoadingState("LOADED");
      setValuesMode(newValuesMode);
    }
  };

  const fetchFieldValues = async (query?: string): Promise<FieldValue[]> => {
    if (query == null) {
      const nonVirtualFields = getNonVirtualFields(fields);

      const results = await Promise.all(
        nonVirtualFields.map(field =>
          dispatch(Fields.objectActions.fetchFieldValues(field)),
        ),
      );

      // extract the field values from the API response(s)
      // the entity loader has inconsistent return structure, so we have to handle both
      const fieldValues: FieldValue[][] = nonVirtualFields.map(
        (field, index) =>
          results[index]?.payload?.values ??
          Fields.selectors.getFieldValues(results[index]?.payload, {
            entityId: field.getUniqueId(),
          }),
      );

      return dedupeValues(fieldValues);
    } else {
      const cancelDeferred = defer();
      const cancelled: Promise<unknown> = cancelDeferred.promise;
      _cancel.current = () => {
        _cancel.current = null;
        cancelDeferred.resolve();
      };

      const options = await searchFieldValues(
        {
          value: query,
          fields,
          disablePKRemappingForSearch,
          maxResults,
        },
        cancelled,
      );

      _cancel.current = null;
      return options;
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
    const cardId = question?.id();

    if (!isNotNull(cardId) || !parameter) {
      return { has_more_values: false, values: [] };
    }

    return dispatch(
      fetchCardParameterValues({
        cardId,
        parameter,
        query,
      }),
    );
  };

  const dispatchFetchDashboardParameterValues = async (query?: string) => {
    const dashboardId = dashboard?.id;

    if (!isNotNull(dashboardId) || !parameter || !parameters) {
      return { has_more_values: false, values: [] };
    }

    return dispatch(
      fetchDashboardParameterValues({
        dashboardId,
        parameter,
        parameters,
        query,
      }),
    );
  };

  // ? this may rely on field mutations
  const updateRemappings = (options: FieldValue[]) => {
    if (showRemapping(fields)) {
      const [field] = fields;
      if (
        field.remappedField() === field.searchField(disablePKRemappingForSearch)
      ) {
        dispatch(addRemappings(field.id, options));
      }
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
        setLoadingState("LOADED");
        return;
      }

      await fetchValues(value);

      setLastValue(value);
    }, 500),
  );

  const _search = (value: string) => {
    if (_cancel.current) {
      _cancel.current();
    }

    setLoadingState("LOADING");
    search.current(value);
  };

  const fieldValues = useMemo(() => {
    const configValues =
      parameter?.values_source_config?.values?.filter(
        (entry): entry is FieldValue =>
          Boolean(entry) && typeof entry !== "string",
      ) ?? [];

    // Get the fetched values as well as the values from the parameter settings.
    const allValues = options.concat(configValues);

    const byValue = new Map<RowValue, string | undefined>();
    const byLabel = new Map<string, RowValue>();

    allValues.forEach(entry => {
      const value = getValue(entry);
      const label = getLabel(entry) ?? value?.toString();
      if (!label) {
        return;
      }
      byValue.set(value, label);
      byLabel.set(label, value);
    });

    return { byLabel, byValue };
  }, [parameter?.values_source_config?.values, options]);

  // Get the label/value options for the current values
  // This is needed to show the correct display value for the current value in the MultiSelect
  const valueOptions = useMemo(() => {
    return value
      .map(value => {
        const label = fieldValues.byValue.get(value);
        if (!label) {
          return null;
        }
        return [value, label];
      })
      .filter((entry): entry is FieldValue => Boolean(entry));
  }, [value, fieldValues]);

  function customLabel(value: RowValue): string | undefined {
    return fieldValues.byValue.get(value);
  }

  if (!valueRenderer) {
    valueRenderer = (value: RowValue) =>
      renderValue({
        fields,
        formatOptions,
        value,
        autoLoad: true,
        compact: false,
        displayValue: customLabel(value),
      });
  }

  if (!optionRenderer) {
    optionRenderer = (option: FieldValue) =>
      renderValue({
        fields,
        formatOptions,
        value: getValue(option),
        autoLoad: false,
        displayValue: getLabel(option),
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
  const isLoading = loadingState !== "LOADED";
  const hasListValues = hasList({
    parameter,
    fields,
    disableSearch,
    options,
  });

  const valueForLabel = (label: string | number) => {
    const value = fieldValues.byLabel.get(label?.toString());

    if (value) {
      return value;
    }

    return label;
  };

  const parseFreeformValue = (labelOrValue: string | number) => {
    const value = valueForLabel(labelOrValue);
    return isNumeric(fields[0], parameter)
      ? parseNumberValue(value)
      : parseStringValue(value);
  };

  const shouldCreate = (value: RowValue) => {
    if (typeof value === "string" || typeof value === "number") {
      const res = parseFreeformValue(value);
      return res !== null;
    }

    return true;
  };

  const renderStringOption = useCallback(
    function (option: FieldValue): {
      label: string;
      value: string;
      customlabel?: string;
    } {
      const value = getValue(option);
      const column = fields[0];
      const label =
        getLabel(option) ??
        formatValue(value, {
          ...formatOptions,
          column,
          remap: showRemapping(fields),
          jsx: false,
          maximumFractionDigits: 20,
          // we know it is string | number because we are passing jsx: false
        })?.toString() ??
        "<null>";

      return {
        value: value?.toString() ?? "",
        label,
        customlabel: getLabel(option),
      };
    },
    [fields, formatOptions],
  );

  const CustomItemComponent = useMemo(
    () =>
      forwardRef<HTMLDivElement, SelectItemProps & { customlabel?: string }>(
        function CustomItem(props, ref) {
          const customlabel =
            props.value &&
            renderValue({
              fields,
              formatOptions,
              value: props.value,
              displayValue: props.customlabel,
            });

          return (
            <ItemWrapper
              ref={ref}
              {...props}
              label={customlabel ?? (props.label || "")}
            />
          );
        },
      ),
    [fields, formatOptions],
  );

  const isSimpleInput =
    !multi && (!parameter || parameter.values_query_type === "none");

  return (
    <ErrorBoundary>
      <Box
        ref={ref}
        data-testid="field-values-widget"
        w={(isExpanded && maxWidth) || undefined}
        maw={maxWidth ?? undefined}
        miw={minWidth ?? undefined}
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
          />
        ) : isListMode && hasListValues && !multi ? (
          <SingleSelectListField
            isDashboardFilter={!!parameter}
            placeholder={tokenFieldPlaceholder}
            value={value.filter(v => v != null)}
            onChange={onChange}
            options={options}
            optionRenderer={optionRenderer}
            checkedColor={checkedColor}
          />
        ) : !isSimpleInput ? (
          <MultiAutocomplete
            data-testid="field-values-multi-autocomplete"
            onSearchChange={onInputChange}
            onChange={values => onChange(values.map(parseFreeformValue))}
            value={value
              .map(value => value?.toString())
              .filter((v): v is string => v !== null && v !== undefined)}
            data={options.concat(valueOptions).map(renderStringOption)}
            placeholder={tokenFieldPlaceholder}
            shouldCreate={shouldCreate}
            autoFocus={autoFocus}
            icon={prefix && <span data-testid="input-prefix">{prefix}</span>}
            itemComponent={CustomItemComponent}
          />
        ) : (
          <TokenField
            prefix={prefix}
            value={value.filter(v => v != null)}
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
                value =>
                  value != null &&
                  String(value).toLowerCase().includes(lowerCaseFilterString),
              );
            }}
            onInputChange={onInputChange}
            parseFreeformValue={parseFreeformValue}
            updateOnInputBlur
          />
        )}
      </Box>
    </ErrorBoundary>
  );
}

export const FieldValuesWidget = FieldValuesWidgetInner;

const LoadingState = () => (
  <div
    className={cx(CS.flex, CS.layoutCentered, CS.alignCenter)}
    style={{ minHeight: 82 }}
  >
    <LoadingSpinner size={32} />
  </div>
);

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

// eslint-disable-next-line import/no-default-export
export default connect(mapStateToProps)(FieldValuesWidget);

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
              field =>
                field.searchField(disablePKRemappingForSearch) as Field | null,
            )}
          />
        );
      }
    }
  }
}

function renderValue({
  fields,
  formatOptions,
  value,
  displayValue,
}: {
  fields: Field[];
  formatOptions: Record<string, any>;
  value: RowValue;
  autoLoad?: boolean;
  compact?: boolean;
  displayValue?: string;
}) {
  return (
    <ValueComponent
      value={value}
      column={fields[0]}
      maximumFractionDigits={20}
      remap={displayValue || showRemapping(fields)}
      displayValue={displayValue}
      {...formatOptions}
    />
  );
}

export const ItemWrapper = forwardRef<HTMLDivElement, SelectItemProps>(
  function ItemWrapper({ label, value, ...others }, ref) {
    return (
      <div ref={ref} {...others}>
        {label || value}
      </div>
    );
  },
);
