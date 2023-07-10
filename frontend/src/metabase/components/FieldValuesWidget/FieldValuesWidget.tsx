import { useState, useRef, StyleHTMLAttributes } from "react";
import { useMount, useUnmount } from "react-use";

import { connect } from "react-redux";
import { jt, t } from "ttag";
import _ from "underscore";

import TokenField, {
  parseNumberValue,
  parseStringValue,
} from "metabase/components/TokenField";
import ListField from "metabase/components/ListField";
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
  CardId,
  Dashboard,
  DashboardId,
  Parameter,
  FieldId,
  FieldReference,
  FieldValue,
  RowValue,
  Field as APIField,
  ParameterValues,
} from "metabase-types/api";

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

const mapDispatchToProps = {
  addRemappings,
  fetchFieldValues: Fields.objectActions.fetchFieldValues,
  fetchParameterValues,
  fetchCardParameterValues,
  fetchDashboardParameterValues,
};

function mapStateToProps(state: State, { fields = [] }: { fields: Field[] }) {
  return {
    fields: fields.map(
      field =>
        Fields.selectors.getObject(state, { entityId: field.id }) || field,
    ),
  };
}

type FieldValuesResponse = {
  payload: APIField;
};

interface FetcherOptions {
  query?: string;
  parameter?: Parameter;
  parameters?: Parameter[];
  dashboardId?: DashboardId;
  cardId?: CardId;
}

export interface IFieldValuesWidgetProps {
  color?: string;
  maxResults?: number;
  style?: StyleHTMLAttributes<HTMLDivElement>;
  formatOptions?: Record<string, any>;
  maxWidth?: number;
  minWidth?: number;

  expand?: boolean;
  disableList?: boolean;
  disableSearch?: boolean;
  disablePKRemappingForSearch?: boolean;
  alwaysShowOptions?: boolean;
  showOptionsInPopover?: boolean;

  fetchFieldValues: ({
    id,
  }: {
    id: FieldId | FieldReference;
  }) => Promise<FieldValuesResponse>;
  fetchParameterValues: (options: FetcherOptions) => Promise<ParameterValues>;
  fetchCardParameterValues: (
    options: FetcherOptions,
  ) => Promise<ParameterValues>;
  fetchDashboardParameterValues: (
    options: FetcherOptions,
  ) => Promise<ParameterValues>;

  addRemappings: (
    value: FieldReference | FieldId,
    options: FieldValue[],
  ) => void;

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
  forceTokenField?: boolean;
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
  maxWidth = 500,
  minWidth,
  expand,
  disableList = false,
  disableSearch = false,
  disablePKRemappingForSearch,
  showOptionsInPopover = false,
  fetchFieldValues: fetchFieldValuesProp,
  fetchParameterValues: fetchParameterValuesProp,
  fetchCardParameterValues: fetchCardParameterValuesProp,
  fetchDashboardParameterValues: fetchDashboardParameterValuesProp,
  addRemappings,
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
  forceTokenField = false,
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
        const { values, has_more_values } = await fetchDashboardParameterValues(
          query,
        );
        newOptions = values;
        newValuesMode = has_more_values ? "search" : newValuesMode;
      } else if (canUseCardEndpoints(question)) {
        const { values, has_more_values } = await fetchCardParameterValues(
          query,
        );
        newOptions = values;
        newValuesMode = has_more_values ? "search" : newValuesMode;
      } else if (canUseParameterEndpoints(parameter)) {
        const { values, has_more_values } = await fetchParameterValues(query);
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
        nonVirtualFields.map(field => fetchFieldValuesProp({ id: field.id })),
      );

      // extract the field values from the API response(s)
      // the entity loader has inconsistent return structure, so we have to handle both
      const fieldValues: FieldValue[][] = nonVirtualFields.map(
        (field, index) =>
          results[index]?.payload?.values ??
          Fields.selectors.getFieldValues(results[index]?.payload, {
            entityId: field.id,
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

  const fetchParameterValues = async (query?: string) => {
    return fetchParameterValuesProp({
      parameter,
      query,
    });
  };

  const fetchCardParameterValues = async (query?: string) => {
    return fetchCardParameterValuesProp({
      cardId: question?.id(),
      parameter,
      query,
    });
  };

  const fetchDashboardParameterValues = async (query?: string) => {
    return fetchDashboardParameterValuesProp({
      dashboardId: dashboard?.id,
      parameter,
      parameters,
      query,
    });
  };

  // ? this may rely on field mutations
  const updateRemappings = (options: FieldValue[]) => {
    if (showRemapping(fields)) {
      const [field] = fields;
      if (
        field.remappedField() === field.searchField(disablePKRemappingForSearch)
      ) {
        addRemappings(field.id, options);
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
    valuesMode === "list" &&
    !forceTokenField;
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
    <div
      data-testid="field-values-widget"
      style={{
        width: expand ? maxWidth : undefined,
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
            return option.some(
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
export default connect(mapStateToProps, mapDispatchToProps)(FieldValuesWidget);

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
