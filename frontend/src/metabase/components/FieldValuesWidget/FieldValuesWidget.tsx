import type { StyleHTMLAttributes } from "react";
import { useState, useRef } from "react";
import { useMount, useUnmount } from "react-use";

import { connect } from "react-redux";
import { jt, t } from "ttag";
import _ from "underscore";
import ErrorBoundary from "metabase/ErrorBoundary";

import TokenField, {
  parseNumberValue,
  parseStringValue,
} from "metabase/components/TokenField";
import { ListField } from "metabase/components/ListField";
import ValueComponent from "metabase/components/Value";
import SingleSelectListField from "metabase/components/SingleSelectListField";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import AutoExpanding from "metabase/hoc/AutoExpanding";

import { addRemappings } from "metabase/redux/metadata";
import { defer } from "metabase/lib/promise";
import type { LayoutRendererArgs } from "metabase/components/TokenField/TokenField";
import {
  fetchCardParameterValues,
  fetchDashboardParameterValues,
  fetchParameterValues,
} from "metabase/parameters/actions";

import Fields from "metabase/entities/fields";
import type { State } from "metabase-types/store";

import type {
  Dashboard,
  Parameter,
  FieldValue,
  RowValue,
} from "metabase-types/api";

import { useDispatch } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import type Field from "metabase-lib/metadata/Field";
import type Question from "metabase-lib/Question";

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
} from "./utils";
import { OptionsMessage, StyledEllipsified } from "./FieldValuesWidget.styled";

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
  color?: string;
  maxResults?: number;
  style?: StyleHTMLAttributes<HTMLDivElement>;
  formatOptions?: Record<string, any>;

  containerWidth?: number | string;
  maxWidth?: number;
  minWidth?: number;

  expand?: boolean;
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

  value: string[];
  onChange: (value: string[]) => void;

  multi?: boolean;
  autoFocus?: boolean;
  className?: string;
  prefix?: string;
  placeholder?: string;
  checkedColor?: string;

  valueRenderer?: (value: string | number) => JSX.Element;
  optionRenderer?: (option: FieldValue) => JSX.Element;
  layoutRenderer?: (props: LayoutRendererArgs) => JSX.Element;
}

export function FieldValuesWidgetInner({
  color = "purple",
  maxResults = MAX_SEARCH_RESULTS,
  alwaysShowOptions = true,
  style = {},
  formatOptions = {},
  containerWidth,
  maxWidth = 500,
  minWidth,
  expand,
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
  const dispatch = useDispatch();

  useMount(() => {
    if (shouldList({ parameter, fields, disableSearch })) {
      fetchValues();
    }
  });

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

  if (!valueRenderer) {
    valueRenderer = (value: string | number) =>
      renderValue({
        fields,
        formatOptions,
        value,
        autoLoad: true,
        compact: false,
      });
  }

  if (!optionRenderer) {
    optionRenderer = (option: FieldValue) =>
      renderValue({ fields, formatOptions, value: option[0], autoLoad: false });
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

  const parseFreeformValue = (value: string | number) => {
    return isNumeric(fields[0], parameter)
      ? parseNumberValue(value)
      : parseStringValue(value);
  };

  return (
    <ErrorBoundary>
      <div
        data-testid="field-values-widget"
        style={{
          width: expand ? maxWidth : containerWidth,
          minWidth: minWidth,
          maxWidth: maxWidth,
        }}
      >
        {isListMode && isLoading ? (
          <LoadingState />
        ) : isListMode && hasListValues && multi ? (
          <ListField
            isDashboardFilter={!!parameter}
            placeholder={tokenFieldPlaceholder}
            value={value?.filter((v: string) => v != null)}
            onChange={onChange}
            options={options}
            optionRenderer={optionRenderer}
            checkedColor={checkedColor}
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
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

export const FieldValuesWidget = AutoExpanding(FieldValuesWidgetInner);

const LoadingState = () => (
  <div className="flex layout-centered align-center" style={{ minHeight: 82 }}>
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
  autoLoad,
  compact,
}: {
  fields: Field[];
  formatOptions: Record<string, any>;
  value: RowValue;
  autoLoad?: boolean;
  compact?: boolean;
}) {
  return (
    <ValueComponent
      value={value}
      column={fields[0]}
      maximumFractionDigits={20}
      remap={showRemapping(fields)}
      {...formatOptions}
      autoLoad={autoLoad}
      compact={compact}
    />
  );
}
