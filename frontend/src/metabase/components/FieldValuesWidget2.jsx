/* eslint-disable react/prop-types */
import React, { useState, useEffect, useRef, useMemo } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import _ from "underscore";

import TokenField from "metabase/components/TokenField";
import ValueComponent from "metabase/components/Value";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import AutoExpanding from "metabase/hoc/AutoExpanding";

import { DashboardApi, MetabaseApi } from "metabase/services";
import { defer } from "metabase/lib/promise";
import { stripId } from "metabase/lib/formatting";

import Fields from "metabase/entities/fields";
import { useAsyncFunction } from "metabase/hooks/use-async-function";

const MAX_SEARCH_RESULTS = 100;

const fieldValuesWidgetPropTypes = {
  addRemappings: PropTypes.func,
  expand: PropTypes.bool,
  isSidebar: PropTypes.bool,
};

const optionsMessagePropTypes = {
  message: PropTypes.string.isRequired,
};

// fetch the possible values of a parameter based on the values of the other parameters in a dashboard.
// parameterId = the auto-generated ID of the parameter
// parameters = all parameters in the current dashboard, as an array
const fetchParameterPossibleValues = async (
  dashboardId,
  { id: paramId, filteringParameters = [] } = {},
  parameters,
  query,
) => {
  // build a map of parameter ID -> value for parameters that this parameter is filtered by
  const otherValues = _.chain(parameters)
    .filter(p => filteringParameters.includes(p.id) && p.value != null)
    .map(p => [p.id, p.value])
    .object()
    .value();

  const args = { paramId, query, dashId: dashboardId, ...otherValues };
  const endpoint = query
    ? DashboardApi.parameterSearch
    : DashboardApi.parameterValues;
  // now call the new chain filter API endpoint
  const results = await endpoint(args);
  return results.map(result => [].concat(result));
};

// type Props = {
//   value: Value[],
//   onChange: (value: Value[]) => void,
//   fields: Field[],
//   disablePKRemappingForSearch?: boolean,
//   multi?: boolean,
//   autoFocus?: boolean,
//   color?: string,
//   fetchFieldValues: (id: FieldId) => void,
//   maxResults: number,
//   style?: { [key: string]: string | number },
//   placeholder?: string,
//   formatOptions?: FormattingOptions,
//   maxWidth?: number,
//   minWidth?: number,
//   alwaysShowOptions?: boolean,
//   disableSearch?: boolean,

//   dashboard?: DashboardWithCards,
//   parameter?: Parameter,
//   parameters?: Parameter[],

//   className?: string,
// };

function getTokenFieldPlaceholder(
  fields,
  placeholder,
  disableSearch,
  dashboard,
  loadingState,
  options,
  disablePKRemappingForSearch,
) {
  if (placeholder) {
    return placeholder;
  }

  const [firstField] = fields;

  if (hasList(fields, disableSearch, dashboard, loadingState, options)) {
    return t`Search the list`;
  } else if (isSearchable(fields, disableSearch, disablePKRemappingForSearch)) {
    return getSearchableTokenFieldPlaceholder(
      fields,
      firstField,
      disablePKRemappingForSearch,
    );
  } else {
    return getNonSearchableTokenFieldPlaceholder(firstField);
  }
}

function getSearchableTokenFieldPlaceholder(
  fields,
  firstField,
  disablePKRemappingForSearch,
) {
  let placeholder;

  const names = new Set(
    fields.map(field =>
      stripId(searchField(field, disablePKRemappingForSearch).display_name),
    ),
  );

  if (names.size > 1) {
    placeholder = t`Search`;
  } else {
    const [name] = names;

    placeholder = t`Search by ${name}`;
    if (
      firstField.isID() &&
      firstField !== searchField(firstField, disablePKRemappingForSearch)
    ) {
      placeholder += t` or enter an ID`;
    }
  }
  return placeholder;
}

function getNonSearchableTokenFieldPlaceholder(firstField) {
  if (firstField.isID()) {
    return t`Enter an ID`;
  } else if (firstField.isNumeric()) {
    return t`Enter a number`;
  } else {
    return t`Enter some text`;
  }
}

function shouldList(fields, disableSearch) {
  // Virtual fields come from questions that are based on other questions.
  // Currently, the back end does not return `has_field_values` in their metadata,
  // so we ignore them for now.
  const nonVirtualFields = fields.filter(field => typeof field.id === "number");

  return (
    !disableSearch &&
    nonVirtualFields.every(field => field.has_field_values === "list")
  );
}

function usesChainFilterEndpoints(dashboard) {
  return dashboard?.id != null;
}

function hasList(fields, disableSearch, dashboard, loadingState, options) {
  const nonEmptyArray = a => a && a.length > 0;
  return (
    shouldList(fields, disableSearch) &&
    (usesChainFilterEndpoints(dashboard)
      ? loadingState === "LOADED" && nonEmptyArray(options)
      : fields.every(field => nonEmptyArray(field.values)))
  );
}

function isSearchable(fields, disableSearch, disablePKRemappingForSearch) {
  return (
    !disableSearch &&
    // search is available if:
    // all fields have a valid search field
    fields.every(field => searchField(field, disablePKRemappingForSearch)) &&
    // at least one field is set to display as "search"
    fields.some(f => f.has_field_values === "search") &&
    // and all fields are either "search" or "list"
    fields.every(
      f => f.has_field_values === "search" || f.has_field_values === "list",
    )
  );
}

function searchField(field, disablePKRemappingForSearch) {
  if (disablePKRemappingForSearch && field.isPK()) {
    return field.isSearchable() ? field : null;
  }

  const remappedField = field.remappedField();
  if (remappedField && remappedField.isSearchable()) {
    return remappedField;
  }
  return field.isSearchable() ? field : null;
}

function getOptions(
  fields,
  disableSearch,
  dashboard,
  loadingState,
  options,
  disablePKRemappingForSearch,
) {
  let _options = [];
  if (
    hasList(fields, disableSearch, dashboard, loadingState, options) &&
    !usesChainFilterEndpoints(dashboard)
  ) {
    _options = dedupeValues(fields.map(field => field.values));
  } else if (
    loadingState === "LOADED" &&
    (isSearchable(fields, disableSearch, disablePKRemappingForSearch) ||
      usesChainFilterEndpoints(dashboard))
  ) {
    _options = options;
  } else {
    _options = [];
  }

  return _options;
}

function dedupeValues(valuesList) {
  const uniqueValueMap = new Map(valuesList.flat().map(o => [o[0], o]));
  return Array.from(uniqueValueMap.values());
}

function renderValue(value, options, fields, formatOptions) {
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

function showRemapping(fields) {
  return fields.length === 1;
}

function renderOptions(
  layoutRendereProps,
  alwaysShowOptions,
  fields,
  disableSearch,
  dashboard,
  loadingState,
  options,
  disablePKRemappingForSearch,
) {
  const {
    optionsList,
    isFocused,
    isAllSelected,
    isFiltered,
  } = layoutRendereProps;

  if (alwaysShowOptions || isFocused) {
    if (optionsList) {
      return optionsList;
    } else if (
      hasList(fields, disableSearch, dashboard, loadingState, options)
    ) {
      if (isAllSelected) {
        return <EveryOptionState />;
      }
    } else if (
      isSearchable(fields, disableSearch, disablePKRemappingForSearch)
    ) {
      if (loadingState === "LOADING") {
        return <LoadingState />;
      } else if (loadingState === "LOADED" && isFiltered) {
        return (
          <NoMatchState
            fields={fields.map(field =>
              searchField(field, disablePKRemappingForSearch),
            )}
          />
        );
      }
    }
  }
}

function parseFreeformValue(v, fields) {
  // trim whitespace
  v = String(v || "").trim();
  // empty string is not valid
  if (!v) {
    return null;
  }
  // if the field is numeric we need to parse the string into an integer
  if (fields[0].isNumeric()) {
    if (/^-?\d+(\.\d+)?$/.test(v)) {
      return parseFloat(v);
    } else {
      return null;
    }
  }
  return v;
}

const LoadingState = () => (
  <div
    className="flex layout-centered align-center border-bottom"
    style={{ minHeight: 82 }}
  >
    <LoadingSpinner size={32} />
  </div>
);

const NoMatchState = ({ fields }) => {
  if (fields.length > 1) {
    // if there is more than one field, don't name them
    return <OptionsMessage message={t`No matching result`} />;
  }
  const [{ display_name }] = fields;
  return (
    <OptionsMessage
      message={jt`No matching ${(
        <strong>&nbsp;{display_name}&nbsp;</strong>
      )} found.`}
    />
  );
};

const EveryOptionState = () => (
  <OptionsMessage
    message={t`Including every option in your filter probably won’t do much…`}
  />
);

const OptionsMessage = ({ message }) => (
  <div className="flex layout-centered p4 border-bottom">{message}</div>
);

OptionsMessage.propTypes = optionsMessagePropTypes;

function isSearchEndpointExhausted(value, latestSearch, options, maxResults) {
  // if this search is just an extension of the previous search, and the previous search
  // wasn't truncated, then we don't need to do another search because TypeaheadListing
  // will filter the previous result client-side
  return (
    latestSearch &&
    value.slice(0, latestSearch.length) === latestSearch &&
    options.length < maxResults
  );
}

function FieldValuesWidget2({
  value,
  onChange,
  fields,
  multi,
  autoFocus,
  color = "purple",
  className,
  style = {},
  parameter,
  parameters,

  isSidebar,
  expand,
  maxWidth = 500,
  minWidth,

  maxResults = MAX_SEARCH_RESULTS,
  alwaysShowOptions = true,
  formatOptions = {},
  disableSearch = false,

  disablePKRemappingForSearch,
  dashboard,

  fetchFieldValues,
  addRemappings,
}) {
  const [options, setOptions] = useState([]);
  const [loadingState, setLoadingState] = useState("INIT");
  const [lastQueriedSearchText, setLastQueriedSearchText] = useState("");
  const cancelRef = useRef();

  const fetchDashboardParamValues = useAsyncFunction(async () => {
    setOptions([]);
    setLoadingState("LOADING");

    try {
      const options = await fetchParameterPossibleValues(
        dashboard && dashboard.id,
        parameter,
        parameters,
      );

      setOptions(options);
    } finally {
      setLoadingState("LOADED");
    }
  });

  const search = useAsyncFunction(
    async searchText => {
      if (
        !searchText ||
        isSearchEndpointExhausted(
          searchText,
          lastQueriedSearchText,
          options,
          maxResults,
        )
      ) {
        return;
      }

      const cancelDeferred = defer();
      cancelRef.current = () => {
        cancelRef.current = null;
        cancelDeferred.resolve();
      };

      let results;
      try {
        if (usesChainFilterEndpoints(dashboard)) {
          results = await fetchParameterPossibleValues(
            dashboard && dashboard.id,
            parameter,
            parameters,
            searchText,
          );
        } else {
          results = dedupeValues(
            await Promise.all(
              fields.map(field =>
                MetabaseApi.field_search(
                  {
                    searchText,
                    fieldId: field.id,
                    searchFieldId: searchField(
                      field,
                      disablePKRemappingForSearch,
                    ).id,
                    limit: maxResults,
                  },
                  { cancelled: cancelDeferred.promise },
                ),
              ),
            ),
          );

          results = results.map(result => [].concat(result));
        }
      } catch (e) {
        console.warn(e);
      }

      if (showRemapping(fields)) {
        const [field] = fields;
        if (
          field.remappedField() ===
          searchField(field, disablePKRemappingForSearch)
        ) {
          addRemappings(field.id, results);
        }
      }

      cancelRef.current = null;

      setLastQueriedSearchText(searchText);
      setOptions(results || []);
      setLoadingState(results ? "LOADED" : "INIT");
    },
    [
      addRemappings,
      dashboard,
      disablePKRemappingForSearch,
      fields,
      lastQueriedSearchText,
      maxResults,
      options,
      parameter,
      parameters,
    ],
  );

  const debouncedSearch = useMemo(() => _.debounce(search, 500), [search]);

  function onInputChange(value) {
    if (
      value &&
      isSearchable(fields, disableSearch, disablePKRemappingForSearch)
    ) {
      setLoadingState("LOADING");

      if (_.isFunction(cancelRef.current)) {
        cancelRef.current();
      }

      debouncedSearch(value);
    }

    return value;
  }

  useEffect(() => {
    if (shouldList(fields, disableSearch)) {
      if (usesChainFilterEndpoints(dashboard)) {
        fetchDashboardParamValues();
      } else {
        fields.forEach(field => fetchFieldValues(field.id));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeholder = getTokenFieldPlaceholder(
    fields,
    placeholder,
    disableSearch,
    dashboard,
    loadingState,
    options,
    disablePKRemappingForSearch,
  );

  const _options = getOptions(
    fields,
    disableSearch,
    dashboard,
    loadingState,
    options,
    disablePKRemappingForSearch,
  );

  const filterOption = (option, filterString) => {
    const lowerCaseFilterString = filterString.toLowerCase();
    return option.some(
      value =>
        value != null &&
        String(value)
          .toLowerCase()
          .includes(lowerCaseFilterString),
    );
  };

  return (
    <div
      className={cx({ "PopoverBody--marginBottom": !isSidebar })}
      style={{
        width: expand ? maxWidth : null,
        minWidth: minWidth,
        maxWidth: maxWidth,
      }}
    >
      <TokenField
        value={value.filter(v => v != null)}
        onChange={onChange}
        placeholder={placeholder}
        updateOnInputChange
        multi={multi}
        autoFocus={autoFocus}
        color={color}
        style={{ ...style, minWidth: "inherit" }}
        className={className}
        optionsStyle={!parameter ? { maxHeight: "none" } : {}}
        options={_options}
        valueKey={0}
        valueRenderer={value =>
          renderValue(
            value,
            { autoLoad: true, compact: false },
            fields,
            formatOptions,
          )
        }
        optionRenderer={option =>
          renderValue(option[0], { autoLoad: false }, fields, formatOptions)
        }
        layoutRenderer={props => (
          <div>
            {props.valuesList}
            {renderOptions(
              props,
              alwaysShowOptions,
              fields,
              disableSearch,
              dashboard,
              loadingState,
              _options,
              disablePKRemappingForSearch,
            )}
          </div>
        )}
        filterOption={filterOption}
        onInputChange={value => onInputChange(value)}
        parseFreeformValue={value => parseFreeformValue(value, fields)}
      />
    </div>
  );
}

function mapStateToProps(state, props) {
  // try to use the selected fields, but fall back to the ones passed
  return {
    fields: props.fields.map(
      field =>
        Fields.selectors.getObject(state, { entityId: field.id }) || field,
    ),
  };
}

const mapDispatchToProps = {
  addRemappings: Fields.actions.addRemappings,
  fetchFieldValues: Fields.actions.fetchFieldValues,
};

export default _.compose(
  AutoExpanding,
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(FieldValuesWidget2);

FieldValuesWidget2.propTypes = fieldValuesWidgetPropTypes;
