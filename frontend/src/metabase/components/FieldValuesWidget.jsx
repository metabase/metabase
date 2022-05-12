/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import _ from "underscore";

import TokenField, {
  parseNumberValue,
  parseStringValue,
} from "metabase/components/TokenField";
import ListField from "metabase/components/ListField";
import ValueComponent from "metabase/components/Value";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import AutoExpanding from "metabase/hoc/AutoExpanding";

import { MetabaseApi } from "metabase/services";
import { addRemappings, fetchFieldValues } from "metabase/redux/metadata";
import { defer } from "metabase/lib/promise";
import { stripId } from "metabase/lib/formatting";
import { fetchDashboardParameterValues } from "metabase/dashboard/actions";
import { getDashboardParameterValuesCache } from "metabase/dashboard/selectors";

import Fields from "metabase/entities/fields";

const MAX_SEARCH_RESULTS = 100;

const fieldValuesWidgetPropTypes = {
  addRemappings: PropTypes.func,
  expand: PropTypes.bool,
};

const optionsMessagePropTypes = {
  message: PropTypes.string.isRequired,
};

const mapDispatchToProps = {
  addRemappings,
  fetchFieldValues,
  fetchDashboardParameterValues,
};

function mapStateToProps(state, { fields = [] }) {
  // try and use the selected fields, but fall back to the ones passed
  return {
    dashboardParameterValuesCache: getDashboardParameterValuesCache(state),
    fields: fields.map(
      field =>
        Fields.selectors.getObject(state, { entityId: field.id }) || field,
    ),
  };
}

class FieldValuesWidgetInner extends Component {
  constructor(props) {
    super(props);
    this.state = {
      options: [],
      loadingState: "INIT",
      lastValue: "",
    };
  }

  static defaultProps = {
    color: "purple",
    maxResults: MAX_SEARCH_RESULTS,
    alwaysShowOptions: true,
    style: {},
    formatOptions: {},
    maxWidth: 500,
    disableSearch: false,
  };

  componentDidMount() {
    if (shouldList(this.props.fields, this.props.disableSearch)) {
      if (usesChainFilterEndpoints(this.props.dashboard)) {
        this.fetchDashboardParamValues();
      } else {
        const { fields, fetchFieldValues } = this.props;
        fields.forEach(field => fetchFieldValues(field.id));
      }
    }
  }

  fetchDashboardParamValues = async () => {
    this.setState({
      loadingState: "LOADING",
      options: [],
    });

    let options;
    try {
      const { dashboard, parameter, parameters } = this.props;
      const args = {
        dashboardId: dashboard?.id,
        parameter,
        parameters,
      };
      await this.props.fetchDashboardParameterValues(args);
      options = this.props.dashboardParameterValuesCache.get(args);
    } finally {
      this.setState({
        loadingState: "LOADED",
        options,
      });
    }
  };

  componentWillUnmount() {
    if (this._cancel) {
      this._cancel();
    }
  }

  onInputChange = value => {
    const { fields, disableSearch, disablePKRemappingForSearch } = this.props;

    if (
      value &&
      isSearchable(fields, disableSearch, disablePKRemappingForSearch)
    ) {
      this._search(value);
    }

    return value;
  };

  search = async (value, cancelled) => {
    if (!value) {
      return;
    }

    const { fields } = this.props;

    let results;
    if (usesChainFilterEndpoints(this.props.dashboard)) {
      const { dashboard, parameter, parameters } = this.props;
      const args = {
        dashboardId: dashboard?.id,
        parameter,
        parameters,
        query: value,
      };
      await this.props.fetchDashboardParameterValues(args);
      results = this.props.dashboardParameterValuesCache.get(args);
    } else {
      results = dedupeValues(
        await Promise.all(
          fields.map(field =>
            MetabaseApi.field_search(
              {
                value,
                fieldId: field.id,
                searchFieldId: searchField(
                  field,
                  this.props.disablePKRemappingForSearch,
                ).id,
                limit: this.props.maxResults,
              },
              { cancelled },
            ),
          ),
        ),
      );

      results = results.map(result => [].concat(result));
    }

    if (showRemapping(fields)) {
      const [field] = fields;
      if (
        field.remappedField() ===
        searchField(field, this.props.disablePKRemappingForSearch)
      ) {
        this.props.addRemappings(field.id, results);
      }
    }

    return results;
  };

  _search = value => {
    const { lastValue, options } = this.state;

    // if this search is just an extension of the previous search, and the previous search
    // wasn't truncated, then we don't need to do another search because TypeaheadListing
    // will filter the previous result client-side
    if (
      lastValue &&
      value.slice(0, lastValue.length) === lastValue &&
      options.length < this.props.maxResults
    ) {
      return;
    }

    this.setState({
      loadingState: "LOADING",
    });

    if (this._cancel) {
      this._cancel();
    }

    this._searchDebounced(value);
  };

  _searchDebounced = _.debounce(async value => {
    this.setState({
      loadingState: "LOADING",
    });

    const cancelDeferred = defer();
    this._cancel = () => {
      this._cancel = null;
      cancelDeferred.resolve();
    };

    let results;
    try {
      results = await this.search(value, cancelDeferred.promise);
    } catch (e) {
      console.warn(e);
    }

    this._cancel = null;

    if (results) {
      this.setState({
        loadingState: "LOADED",
        options: results,
        lastValue: value,
      });
    } else {
      this.setState({
        loadingState: "INIT",
        options: [],
        lastValue: value,
      });
    }
  }, 500);

  render() {
    const {
      value,
      onChange,
      fields,
      multi,
      autoFocus,
      color,
      className,
      style,
      parameter,
      prefix,
      disableSearch,
      dashboard,
      disablePKRemappingForSearch,
      formatOptions,
      placeholder,
    } = this.props;
    const { loadingState, options: stateOptions } = this.state;

    const tokenFieldPlaceholder = getTokenFieldPlaceholder({
      fields,
      disableSearch,
      dashboard,
      placeholder,
      disablePKRemappingForSearch,
      loadingState,
      options: stateOptions,
    });

    let options = [];
    if (
      hasList({
        fields,
        disableSearch,
        dashboard,
        loadingState,
        options: stateOptions,
      }) &&
      !usesChainFilterEndpoints(this.props.dashboard)
    ) {
      options = dedupeValues(fields.map(field => field.values));
    } else if (
      loadingState === "LOADED" &&
      (isSearchable(fields, disableSearch, disablePKRemappingForSearch) ||
        usesChainFilterEndpoints(this.props.dashboard))
    ) {
      options = this.state.options;
    } else {
      options = [];
    }

    const isLoading = loadingState === "LOADING";
    const isFetchingList =
      shouldList(this.props.fields, this.props.disableSearch) && isLoading;
    const hasListData = hasList({
      fields,
      disableSearch,
      dashboard,
      loadingState,
      options: stateOptions,
    });

    return (
      <div
        style={{
          width: this.props.expand ? this.props.maxWidth : null,
          minWidth: this.props.minWidth,
          maxWidth: this.props.maxWidth,
        }}
      >
        {isFetchingList && <LoadingState />}
        {hasListData && (
          <ListField
            isDashboardFilter={parameter}
            placeholder={tokenFieldPlaceholder}
            value={value.filter(v => v != null)}
            onChange={onChange}
            options={options}
            optionRenderer={option =>
              renderValue(fields, formatOptions, option[0], {
                autoLoad: false,
              })
            }
          />
        )}
        {!hasListData && !isFetchingList && (
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
            optionsStyle={!parameter ? { maxHeight: "none" } : {}}
            // end forwarded props
            options={options}
            valueKey={0}
            valueRenderer={value =>
              renderValue(fields, formatOptions, value, {
                autoLoad: true,
                compact: false,
              })
            }
            optionRenderer={option =>
              renderValue(fields, formatOptions, option[0], { autoLoad: false })
            }
            layoutRenderer={layoutProps => (
              <div>
                {layoutProps.valuesList}
                {renderOptions(this.state, this.props, layoutProps)}
              </div>
            )}
            filterOption={(option, filterString) => {
              const lowerCaseFilterString = filterString.toLowerCase();
              return option.some(
                value =>
                  value != null &&
                  String(value)
                    .toLowerCase()
                    .includes(lowerCaseFilterString),
              );
            }}
            onInputChange={this.onInputChange}
            parseFreeformValue={value => {
              return fields[0].isNumeric()
                ? parseNumberValue(value)
                : parseStringValue(value);
            }}
          />
        )}
      </div>
    );
  }
}

export const FieldValuesWidget = AutoExpanding(FieldValuesWidgetInner);

FieldValuesWidget.propTypes = fieldValuesWidgetPropTypes;

function dedupeValues(valuesList) {
  const uniqueValueMap = new Map(valuesList.flat().map(o => [o[0], o]));
  return Array.from(uniqueValueMap.values());
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

export default connect(mapStateToProps, mapDispatchToProps)(FieldValuesWidget);

// if [dashboard] parameter ID is specified use the fancy new Chain Filter API endpoints to fetch parameter values.
// Otherwise (e.g. for Cards) fall back to the old field/:id/values endpoint
function usesChainFilterEndpoints(dashboard) {
  return dashboard?.id;
}

function showRemapping(fields) {
  return fields.length === 1;
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

function getNonSearchableTokenFieldPlaceholder(firstField) {
  if (firstField.isID()) {
    return t`Enter an ID`;
  } else if (firstField.isString()) {
    return t`Enter some text`;
  } else if (firstField.isNumeric()) {
    return t`Enter a number`;
  }

  // fallback
  return t`Enter some text`;
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

function hasList({ fields, disableSearch, dashboard, loadingState, options }) {
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

function getTokenFieldPlaceholder({
  fields,
  disableSearch,
  dashboard,
  placeholder,
  disablePKRemappingForSearch,
  loadingState,
  options,
}) {
  if (placeholder) {
    return placeholder;
  }

  const [firstField] = fields;

  if (
    hasList({
      fields,
      disableSearch,
      disablePKRemappingForSearch,
      dashboard,
      loadingState,
      options,
    })
  ) {
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

function renderOptions(
  state,
  props,
  { optionsList, isFocused, isAllSelected, isFiltered },
) {
  const {
    alwaysShowOptions,
    fields,
    disableSearch,
    dashboard,
    disablePKRemappingForSearch,
  } = props;
  const { loadingState, options } = state;

  if (alwaysShowOptions || isFocused) {
    if (optionsList) {
      return optionsList;
    } else if (
      hasList({
        fields,
        disableSearch,
        dashboard,
        loadingState,
        options,
      })
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
