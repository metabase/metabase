/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "c-3po";

import TokenField from "metabase/components/TokenField";
import RemappedValue from "metabase/containers/RemappedValue";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import { MetabaseApi } from "metabase/services";
import { addRemappings, fetchFieldValues } from "metabase/redux/metadata";
import { defer } from "metabase/lib/promise";
import { debounce } from "underscore";
import { stripId } from "metabase/lib/formatting";

import type Field from "metabase-lib/lib/metadata/Field";
import type { FieldId } from "metabase/meta/types/Field";
import type { Value } from "metabase/meta/types/Dataset";

const MAX_SEARCH_RESULTS = 100;

const mapDispatchToProps = {
  addRemappings,
  fetchFieldValues,
};

type Props = {
  value: Value[],
  onChange: (value: Value[]) => void,
  field: Field,
  searchField?: Field,
  multi?: boolean,
  autoFocus?: boolean,
  color?: string,
  fetchFieldValues: (id: FieldId) => void,
  maxResults: number,
  style?: { [key: string]: string | number },
  placeholder?: string,
};

type State = {
  focused: boolean,
  loadingState: "INIT" | "LOADING" | "LOADED",
  options: [Value, ?string][],
  lastValue: string,
};

export class FieldValuesWidget extends Component {
  props: Props;
  state: State;

  _cancel: ?() => void;

  constructor(props: Props) {
    super(props);
    this.state = {
      focused: false,
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
  };

  componentWillMount() {
    const { field, fetchFieldValues } = this.props;
    if (field.has_field_values === "list") {
      fetchFieldValues(field.id);
    }
  }

  componentWillUnmount() {
    if (this._cancel) {
      this._cancel();
    }
  }

  hasList() {
    const { field } = this.props;
    return field.has_field_values === "list" && field.values;
  }

  isSearchable() {
    const { field, searchField } = this.props;
    return searchField && field.has_field_values === "search";
  }

  onInputChange = (value: string) => {
    if (value && this.isSearchable()) {
      this._search(value);
    }

    return value;
  };

  search = async (value: string, cancelled: Promise<void>) => {
    const { field, searchField, maxResults } = this.props;

    if (!field || !searchField || !value) {
      return;
    }

    const fieldId = (field.target || field).id;
    const searchFieldId = searchField.id;
    let results = await MetabaseApi.field_search(
      {
        value,
        fieldId,
        searchFieldId,
        limit: maxResults,
      },
      { cancelled },
    );

    if (results && field.remappedField() === searchField) {
      // $FlowFixMe: addRemappings provided by @connect
      this.props.addRemappings(field.id, results);
    }
    return results;
  };

  _search = (value: string) => {
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
      loadingState: "INIT",
    });

    if (this._cancel) {
      this._cancel();
    }

    this._searchDebounced(value);
  };

  // $FlowFixMe
  _searchDebounced = debounce(async (value): void => {
    this.setState({
      loadingState: "LOADING",
    });

    const cancelDeferred = defer();
    this._cancel = () => {
      this._cancel = null;
      cancelDeferred.resolve();
    };

    let results = await this.search(value, cancelDeferred.promise);

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
      field,
      searchField,
      multi,
      autoFocus,
      color,
    } = this.props;
    const { loadingState } = this.state;

    let { placeholder } = this.props;
    if (!placeholder) {
      if (this.hasList()) {
        placeholder = t`Search the list`;
      } else if (this.isSearchable() && searchField) {
        const searchFieldName =
          stripId(searchField.display_name) || searchField.display_name;
        placeholder = t`Search by ${searchFieldName}`;
        if (field.isID() && field !== searchField) {
          placeholder += t` or enter an ID`;
        }
      } else {
        if (field.isID()) {
          placeholder = t`Enter an ID`;
        } else if (field.isNumeric()) {
          placeholder = t`Enter a number`;
        } else {
          placeholder = t`Enter some text`;
        }
      }
    }

    let options = [];
    if (this.hasList()) {
      options = field.values;
    } else if (this.isSearchable() && loadingState === "LOADED") {
      options = this.state.options;
    } else {
      options = [];
    }

    return (
      <div>
        <TokenField
          value={value.filter(v => v != null)}
          onChange={onChange}
          placeholder={placeholder}
          multi={multi}
          autoFocus={autoFocus}
          color={color}
          style={{
            borderWidth: 2,
            ...this.props.style,
          }}
          updateOnInputChange
          options={options}
          valueKey={0}
          valueRenderer={value => (
            <RemappedValue
              value={value}
              column={field}
              round={false}
              autoLoad={true}
            />
          )}
          optionRenderer={option => (
            <RemappedValue
              value={option[0]}
              column={field}
              round={false}
              autoLoad={false}
            />
          )}
          layoutRenderer={({ valuesList, optionsList, focused, onClose }) => (
            <div>
              {valuesList}
              {this.props.alwaysShowOptions || this.state.focused
                ? optionsList ||
                  (this.hasList() ? (
                    <OptionsMessage
                      message={t`Including every option in your filter probably won’t do much…`}
                    />
                  ) : this.isSearchable() && loadingState === "LOADED" ? (
                    <OptionsMessage message={t`No matching results found`} />
                  ) : null)
                : null}
            </div>
          )}
          filterOption={(option, filterString) =>
            (option[0] != null &&
              String(option[0])
                .toLowerCase()
                .indexOf(filterString.toLowerCase()) === 0) ||
            (option[1] != null &&
              String(option[1])
                .toLowerCase()
                .indexOf(filterString.toLowerCase()) === 0)
          }
          onInputChange={this.onInputChange}
          parseFreeformValue={v => {
            // trim whitespace
            v = String(v || "").trim();
            // empty string is not valid
            if (!v) {
              return null;
            }
            // if the field is numeric we need to parse the string into an integer
            if (field.isNumeric()) {
              if (/^-?\d+(\.\d+)?$/.test(v)) {
                return parseFloat(v);
              } else {
                return null;
              }
            }
            return v;
          }}
          onFocus={() => this.setState({ focused: true })}
          onBlur={() => this.setState({ focused: false })}
        />
        {loadingState === "LOADING" ? (
          <div
            className="flex layout-centered align-center"
            style={{ minHeight: 100 }}
          >
            <LoadingSpinner size={32} />
          </div>
        ) : null}
      </div>
    );
  }
}

const OptionsMessage = ({ message }) => (
  <div className="flex layout-centered p4">{message}</div>
);

export default connect(null, mapDispatchToProps)(FieldValuesWidget);
