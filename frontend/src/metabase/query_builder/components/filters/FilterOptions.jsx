import React, { Component } from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import { getFilterOptions, setFilterOptions } from "metabase/lib/query/filter";

import CheckBox from "metabase/core/components/CheckBox";
import * as MetabaseAnalytics from "metabase/lib/analytics";

const OPTION_NAMES = {
  "case-sensitive": () => t`Case sensitive`,
};

// These options are shown in the specific picker components
const IGNORE_OPTIONS = ["include-current"];

export default class FilterOptions extends Component {
  static propTypes = {
    filter: PropTypes.array.isRequired,
    onFilterChange: PropTypes.func.isRequired,
    // either an operator from schema_metadata or DatePicker
    operator: PropTypes.object.isRequired,
  };

  getOptions() {
    const options = (this.props.operator && this.props.operator.options) || {};
    return Object.fromEntries(
      Object.entries(options).filter(
        ([key]) => IGNORE_OPTIONS.indexOf(key) === -1,
      ),
    );
  }

  getOptionName(name) {
    if (OPTION_NAMES[name]) {
      return OPTION_NAMES[name](this.props.filter);
    }
    return name;
  }

  getOptionValue(name) {
    const { filter } = this.props;
    const value = getFilterOptions(filter)[name];
    if (value !== undefined) {
      return value;
    }
    const option = this.getOptions()[name];
    if (option && option.defaultValue !== undefined) {
      return option.defaultValue;
    }
    // for now values are always boolean, default to false
    return false;
  }

  setOptionValue(name, value) {
    const { filter } = this.props;
    const options = getFilterOptions(filter);
    this.props.onFilterChange(
      setFilterOptions(filter, {
        ...options,
        [name]: !options[name],
      }),
    );
    MetabaseAnalytics.trackStructEvent(
      "QueryBuilder",
      "Filter",
      "SetOption",
      name,
    );
  }

  toggleOptionValue(name) {
    this.setOptionValue(name, !this.getOptionValue(name));
  }

  render() {
    const options = Object.entries(this.getOptions());
    if (options.length === 0) {
      return null;
    }
    return (
      <div className="flex align-center">
        {options.map(([name, option]) => (
          <div key={name} className="flex align-center">
            <CheckBox
              label={this.getOptionName(name)}
              checkedColor="accent2"
              checked={this.getOptionValue(name)}
              onChange={() => this.toggleOptionValue(name)}
            />
          </div>
        ))}
      </div>
    );
  }
}
