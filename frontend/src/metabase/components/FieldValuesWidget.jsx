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
  return {
    fields: fields.map(
      field =>
        Fields.selectors.getObject(state, { entityId: field.id }) || field,
    ),
  };
}

async function searchFieldValues(
  { fields, value, disablePKRemappingForSearch, maxResults },
  cancelled,
) {
  let options = dedupeValues(
    await Promise.all(
      fields.map(field =>
        MetabaseApi.field_search(
          {
            value,
            fieldId: field.id,
            searchFieldId: searchField(field, disablePKRemappingForSearch).id,
            limit: maxResults,
          },
          { cancelled },
        ),
      ),
    ),
  );

  options = options.map(result => [].concat(result));
  return options;
}

class FieldValuesWidgetInner extends Component {
  constructor(props) {
    super(props);
    const { fields, disableSearch, disablePKRemappingForSearch } = props;
    this.state = {
      options: [],
      loadingState: "INIT",
      lastValue: "",
      valuesMode: getValuesMode(
        fields,
        disableSearch,
        disablePKRemappingForSearch,
      ),
    };
  }

  static defaultProps = {
    color: "purple",
    maxResults: MAX_SEARCH_RESULTS,
    alwaysShowOptions: true,
    style: {},
    formatOptions: {},
    maxWidth: 500,
    disableList: false,
    disableSearch: false,
    showOptionsInPopover: false,
  };

  componentDidMount() {
    if (shouldList(this.props.fields, this.props.disableSearch)) {
      this.fetchValues();
    }
  }

  async fetchValues(query) {
    this.setState({
      loadingState: "LOADING",
      options: [],
    });

    let options = [];
    let valuesMode = this.state.valuesMode;
    try {
      if (usesChainFilterEndpoints(this.props.dashboard)) {
        const { results, has_more_values } =
          await this.fetchDashboardParamValues(query);
        options = results;
        valuesMode = has_more_values ? "search" : valuesMode;
      } else {
        options = await this.fetchFieldValues(query);
        const { fields, disableSearch, disablePKRemappingForSearch } =
          this.props;
        valuesMode = getValuesMode(
          fields,
          disableSearch,
          disablePKRemappingForSearch,
        );
      }
    } finally {
      this.updateRemappings(options);
      this.setState({
        loadingState: "LOADED",
        options,
        valuesMode,
      });
    }
  }

  fetchFieldValues = async query => {
    if (query == null) {
      const { fields, fetchFieldValues } = this.props;
      await Promise.all(fields.map(field => fetchFieldValues(field.id)));
      return dedupeValues(this.props.fields.map(field => field.values));
    } else {
      const { fields } = this.props;
      const cancelDeferred = defer();
      const cancelled = cancelDeferred.promise;
      this._cancel = () => {
        this._cancel = null;
        cancelDeferred.resolve();
      };

      const options = await searchFieldValues(
        {
          value: query,
          fields,
          disablePKRemappingForSearch: this.props.disablePKRemappingForSearch,
          maxResults: this.props.maxResults,
        },
        cancelled,
      );

      this._cancel = null;
      return options;
    }
  };

  fetchDashboardParamValues = async query => {
    const { dashboard, parameter, parameters } = this.props;
    const args = {
      dashboardId: dashboard?.id,
      parameter,
      parameters,
      query,
    };
    return this.props.fetchDashboardParameterValues(args);
  };

  updateRemappings(options) {
    const { fields } = this.props;
    if (showRemapping(fields)) {
      const [field] = fields;
      if (
        field.remappedField() ===
        searchField(field, this.props.disablePKRemappingForSearch)
      ) {
        this.props.addRemappings(field.id, options);
      }
    }
  }

  componentWillUnmount() {
    if (this._cancel) {
      this._cancel();
    }
  }

  onInputChange = value => {
    const { maxResults } = this.props;
    const { lastValue, options } = this.state;
    let { valuesMode } = this.state;

    // override "search" mode when searching is unnecessary
    valuesMode = isExtensionOfPreviousSearch(
      value,
      lastValue,
      options,
      maxResults,
    )
      ? "list"
      : valuesMode;

    if (valuesMode === "search") {
      this._search(value);
    }

    return value;
  };

  search = _.debounce(async value => {
    if (!value) {
      this.setState({
        loadingState: "LOADED",
      });
      return;
    }

    await this.fetchValues(value);

    this.setState({
      lastValue: value,
    });
  }, 500);

  _search = value => {
    if (this._cancel) {
      this._cancel();
    }

    this.setState({
      loadingState: "LOADING",
    });
    this.search(value);
  };

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
      disableList,
      disablePKRemappingForSearch,
      formatOptions,
      placeholder,
      forceTokenField = false,
      showOptionsInPopover,
      checkedColor,
      valueRenderer = value =>
        renderValue(fields, formatOptions, value, {
          autoLoad: true,
          compact: false,
        }),
      optionRenderer = option =>
        renderValue(fields, formatOptions, option[0], {
          autoLoad: false,
        }),
      layoutRenderer = showOptionsInPopover
        ? undefined
        : layoutProps => (
            <div>
              {layoutProps.valuesList}
              {renderOptions(this.state, this.props, layoutProps)}
            </div>
          ),
    } = this.props;
    const { loadingState, options = [], valuesMode } = this.state;

    const tokenFieldPlaceholder = getTokenFieldPlaceholder({
      fields,
      disableSearch,
      placeholder,
      disablePKRemappingForSearch,
      loadingState,
      options,
      valuesMode,
    });

    const isLoading = loadingState === "LOADING";
    const usesListField =
      !disableList &&
      hasList({
        fields,
        disableSearch,
        options,
      }) &&
      valuesMode === "list";

    return (
      <div
        style={{
          width: this.props.expand ? this.props.maxWidth : null,
          minWidth: this.props.minWidth,
          maxWidth: this.props.maxWidth,
        }}
      >
        {usesListField &&
          !forceTokenField &&
          (isLoading ? (
            <LoadingState />
          ) : (
            <ListField
              isDashboardFilter={parameter}
              placeholder={tokenFieldPlaceholder}
              value={value.filter(v => v != null)}
              onChange={onChange}
              options={options}
              optionRenderer={optionRenderer}
              checkedColor={checkedColor}
            />
          ))}
        {(!usesListField || forceTokenField) && (
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
  <div className="flex layout-centered align-center" style={{ minHeight: 82 }}>
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
  <div className="flex layout-centered p4">{message}</div>
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

export function searchField(field, disablePKRemappingForSearch) {
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

function hasList({ fields, disableSearch, options }) {
  return shouldList(fields, disableSearch) && !_.isEmpty(options);
}

// if this search is just an extension of the previous search, and the previous search
// wasn't truncated, then we don't need to do another search because TypeaheadListing
// will filter the previous result client-side
function isExtensionOfPreviousSearch(value, lastValue, options, maxResults) {
  return (
    lastValue &&
    value.slice(0, lastValue.length) === lastValue &&
    options.length < maxResults
  );
}

export function isSearchable({
  fields,
  disableSearch,
  disablePKRemappingForSearch,
  valuesMode,
}) {
  function everyFieldIsSearchable() {
    return fields.every(field =>
      searchField(field, disablePKRemappingForSearch),
    );
  }

  function someFieldIsConfiguredForSearch() {
    return fields.some(
      f =>
        f.has_field_values === "search" ||
        (f.has_field_values === "list" && f.has_more_values === true),
    );
  }

  return (
    !disableSearch &&
    (valuesMode === "search" ||
      (everyFieldIsSearchable() && someFieldIsConfiguredForSearch()))
  );
}

function getTokenFieldPlaceholder({
  fields,
  disableSearch,
  placeholder,
  disablePKRemappingForSearch,
  loadingState,
  options,
  valuesMode,
}) {
  if (placeholder) {
    return placeholder;
  }

  const [firstField] = fields;

  if (
    hasList({
      fields,
      disableSearch,
      options,
    })
  ) {
    return t`Search the list`;
  } else if (
    isSearchable({
      fields,
      disableSearch,
      disablePKRemappingForSearch,
      valuesMode,
    })
  ) {
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
    disablePKRemappingForSearch,
  } = props;
  const { loadingState, options, valuesMode } = state;

  if (alwaysShowOptions || isFocused) {
    if (optionsList) {
      return optionsList;
    } else if (
      hasList({
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

export function getValuesMode(
  fields,
  disableSearch,
  disablePKRemappingForSearch,
) {
  if (fields.length === 0) {
    return "none";
  }

  if (
    isSearchable({
      fields,
      disableSearch,
      disablePKRemappingForSearch,
      valuesMode: undefined,
    })
  ) {
    return "search";
  }

  if (shouldList(fields, disableSearch)) {
    return "list";
  }

  return "none";
}
