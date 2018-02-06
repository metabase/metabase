
import React, { Component } from "react";
import { connect } from "react-redux";

import TokenField from "metabase/components/TokenField";
import RemappedValue from "metabase/containers/RemappedValue";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import { MetabaseApi } from "metabase/services";
import { addRemappings } from "metabase/redux/metadata";
import { defer } from "metabase/lib/promise";
import { debounce } from "underscore";
import { stripId } from "metabase/lib/formatting";

const MAX_SEARCH_RESULTS = 100;

const mapDispatchToProps = {
    addRemappings
};

@connect(null, mapDispatchToProps)
export default class FieldValuesWidget extends Component {
  constructor(props) {
    super(props);
    this.state = {
      options: [],
      loadingState: "INIT"
    }
  }

  static defaultProps = {
      maxResults: MAX_SEARCH_RESULTS
  };

  onInputChange = (value) => {
    const { field } = this.props;

    if (field.hasFieldValues() === "search") {
      this._search(value);
    }

    return value;
  }

  search = async (value: String, cancelled: Promise<void>) => {
      const { field, maxResults } = this.props;
      const searchField = field.searchField()

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
              limit: maxResults
          },
          { cancelled }
      );

      if (results && field !== searchField) {
          // $FlowFixMe: addRemappings provided by @connect
          this.props.addRemappings(field.id, results);
      }
      return results;
  };


  _search = (value) => {
      const { lastValue, options } = this.state;

      // if this search is just an extension of the previous search, and the previous search
      // wasn't truncated, then we don't need to do another search because TypeaheadListing
      // will filter the previous result client-side
      if (lastValue && value.slice(0, lastValue.length) === lastValue &&
          options.length < this.props.maxResults
      ) {
          return;
      }

      this.setState({
          loadingState: "INIT"
      });

      this._searchDebounced(value);
  }

  // $FlowFixMe
  _searchDebounced = debounce(async (value): void => {
      this.setState({
          loadingState: "LOADING"
      });

      const cancelDeferred = defer();
      this._cancel = () => {
          this._cancel = null;
          cancelDeferred.resolve();
      }

      let results = await this.search(value, cancelDeferred.promise);

      this._cancel = null;

      if (results) {
          this.setState({
              loadingState: "LOADED",
              options: results,
              lastValue: value
          });
      } else {
          this.setState({
              loadingState: "INIT",
              options: [],
              lastValue: value
          });
      }
  }, 500)


  render() {
    const { value, onChange, field, multi, autoFocus } = this.props;
    const { loadingState } = this.state;
    const hasFieldValues = field.hasFieldValues();

    let placeholder;
    if (hasFieldValues === "list") {
      placeholder = `Select a ${field.display_name}`;
    } else if (hasFieldValues === "search") {
      placeholder = `Search for a ${stripId(field.searchField().display_name)}`;
      if (field.isID()) {
        placeholder += ` or enter an ID`;
      }
    } else {
      placeholder = `Enter a ${field.display_name}`
    }

    let options = [];
    if (hasFieldValues === "list") {
      options = field.values;
    } else if (hasFieldValues === "search" && loadingState === "LOADED") {
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
          color="purple"

          options={options}

          valueKey={0}
          valueRenderer={value => <RemappedValue value={value} column={field} round={false} autoLoad={false} />}
          optionRenderer={option => <RemappedValue value={option[0]} column={field} round={false} autoLoad={false} />}
          layoutRenderer={({ valuesList, optionsList, focused, onClose }) =>
            <div>
              {valuesList}
              {optionsList}
            </div>
          }

          filterOption={(option, filterString) => (
              (option[0] != null && ~String(option[0]).toLowerCase().indexOf(filterString.toLowerCase())) ||
              (option[1] != null && ~String(option[1]).toLowerCase().indexOf(filterString.toLowerCase()))
          )}

          onInputChange={this.onInputChange}
          onAddFreeform={v => {
            // if the field is numeric we need to parse the string into an integer
            if (field.isNumeric()) {
              v = parseFloat(v);
              if (isNaN(v)) {
                return null;
              }
            }
            return v;
          }}
        />
        { loadingState === "LOADING" &&
            <div className="flex layout-centered align-center" style={{ minHeight: 100 }}>
              <LoadingSpinner size={32} />
            </div>
        }
      </div>
    )
  }
}
