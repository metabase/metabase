/* eslint-disable react/prop-types */
import { useState, useRef } from "react";

import { useMount, useUnmount } from "react-use";

import PropTypes from "prop-types";
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
import {
  fetchCardParameterValues,
  fetchDashboardParameterValues,
  fetchParameterValues,
} from "metabase/parameters/actions";

import Fields from "metabase/entities/fields";

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

const fieldValuesWidgetPropTypes = {
  addRemappings: PropTypes.func,
  expand: PropTypes.bool,
};

const mapDispatchToProps = {
  addRemappings,
  fetchFieldValues: Fields.objectActions.fetchFieldValues,
  fetchParameterValues,
  fetchCardParameterValues,
  fetchDashboardParameterValues,
};

function mapStateToProps(state, { fields = [] }) {
  return {
    fields: fields.map(
      field =>
        Fields.selectors.getObject(state, { entityId: field.id }) || field,
    ),
  };
}

function FieldValuesWidgetInner({
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
}) {
  const [options, setOptions] = useState([]);
  const [loadingState, setLoadingState] = useState("INIT");
  const [lastValue, setLastValue] = useState("");
  const [valuesMode, setValuesMode] = useState(
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

  const _cancel = useRef(null);

  useUnmount(() => {
    if (_cancel.current) {
      _cancel.current();
    }
  });

  const fetchValues = async query => {
    setLoadingState("LOADING");
    setOptions([]);

    let newOptions = [];
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

  const fetchFieldValues = async query => {
    if (query == null) {
      const nonVirtualFields = getNonVirtualFields(fields);

      const results = await Promise.all(
        nonVirtualFields.map(field => fetchFieldValuesProp({ id: field.id })),
      );

      // extract the field values from the API response(s)
      // the entity loader has inconsistent return structure, so we have to handle both
      const fieldValues = nonVirtualFields.map(
        (field, index) =>
          results[index]?.payload?.values ??
          Fields.selectors.getFieldValues(results[index]?.payload, {
            entityId: field.id,
          }),
      );

      return dedupeValues(fieldValues);
    } else {
      const cancelDeferred = defer();
      const cancelled = cancelDeferred.promise;
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

  const fetchParameterValues = async query => {
    return fetchParameterValuesProp({
      parameter,
      query,
    });
  };

  const fetchCardParameterValues = async query => {
    return fetchCardParameterValuesProp({
      cardId: question.id(),
      parameter,
      query,
    });
  };

  const fetchDashboardParameterValues = async query => {
    return fetchDashboardParameterValuesProp({
      dashboardId: dashboard?.id,
      parameter,
      parameters,
      query,
    });
  };

  const updateRemappings = options => {
    if (showRemapping(fields)) {
      const [field] = fields;
      if (
        field.remappedField() === field.searchField(disablePKRemappingForSearch)
      ) {
        addRemappings(field.id, options);
      }
    }
  };

  const onInputChange = value => {
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
    _.debounce(async value => {
      if (!value) {
        setLoadingState("LOADED");
        return;
      }

      await fetchValues(value);

      setLastValue(value);
    }, 500),
  );

  const _search = value => {
    if (_cancel.current) {
      _cancel.current();
    }

    setLoadingState("LOADING");
    search.current(value);
  };

  if (!valueRenderer) {
    valueRenderer = value =>
      renderValue(fields, formatOptions, value, {
        autoLoad: true,
        compact: false,
      });
  }

  if (!optionRenderer) {
    optionRenderer = option =>
      renderValue(fields, formatOptions, option[0], {
        autoLoad: false,
      });
  }

  if (!layoutRenderer) {
    layoutRenderer = showOptionsInPopover
      ? undefined
      : layoutProps => (
          <div>
            {layoutProps.valuesList}
            {renderOptions({
              alwaysShowOptions,
              parameter,
              fields,
              disableSearch,
              disablePKRemappingForSearch,
              loadingState,
              options,
              valuesMode,
              ...layoutProps,
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
    loadingState,
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

  const parseFreeformValue = value => {
    return isNumeric(fields[0], parameter)
      ? parseNumberValue(value)
      : parseStringValue(value);
  };

  return (
    <div
      style={{
        width: expand ? maxWidth : null,
        minWidth: minWidth,
        maxWidth: maxWidth,
      }}
    >
      {isListMode && isLoading ? (
        <LoadingState />
      ) : isListMode && hasListValues && multi ? (
        <ListField
          isDashboardFilter={parameter}
          placeholder={tokenFieldPlaceholder}
          value={value.filter(v => v != null)}
          onChange={onChange}
          options={options}
          optionRenderer={optionRenderer}
          checkedColor={checkedColor}
        />
      ) : isListMode && hasListValues && !multi ? (
        <SingleSelectListField
          isDashboardFilter={parameter}
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

FieldValuesWidget.propTypes = fieldValuesWidgetPropTypes;

const LoadingState = () => (
  <div className="flex layout-centered align-center" style={{ minHeight: 82 }}>
    <LoadingSpinner size={32} />
  </div>
);

const NoMatchState = ({ fields }) => {
  if (fields.length === 1) {
    const [{ display_name }] = fields;

    return (
      <OptionsMessage>
        {jt`No matching ${(
          <StyledEllipsified>{display_name}</StyledEllipsified>
        )} found.`}
      </OptionsMessage>
    );
  }

  return <OptionsMessage>{t`No matching result`}</OptionsMessage>;
};

const EveryOptionState = () => (
  <OptionsMessage>{t`Including every option in your filter probably won’t do much…`}</OptionsMessage>
);

export default connect(mapStateToProps, mapDispatchToProps)(FieldValuesWidget);

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
}) {
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
            fields={fields.map(field =>
              field.searchField(disablePKRemappingForSearch),
            )}
          />
        );
      }
    }
  }
}

function renderValue(fields, formatOptions, value, options) {
  return (
    <ValueComponent
      value={value}
      column={fields[0]}
      maximumFractionDigits={20}
      remap={showRemapping(fields)}
      {...formatOptions}
      {...options}
    />
  );
}
