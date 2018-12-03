import React, { Component } from "react";
import PropTypes from "prop-types";

import { t, jt } from "c-3po";
import { getFilterOptions, setFilterOptions } from "metabase/lib/query/filter";

import CheckBox from "metabase/components/CheckBox";
import MetabaseAnalytics from "metabase/lib/analytics";

const OPTION_NAMES = {
  "include-current": filter => {
    const period = (
      <strong key="notsurewhythisneedsakey">
        {getCurrentIntervalName(filter)}
      </strong>
    );
    return jt`Include ${period}`;
  },
  "case-sensitive": () => t`Case sensitive`,
};

const CURRENT_INTERVAL_NAME = {
  day: t`today`,
  week: t`this week`,
  month: t`this month`,
  year: t`this year`,
  minute: t`this minute`,
  hour: t`this hour`,
};

function getCurrentIntervalName(filter: FieldFilter): ?string {
  if (filter[0] === "time-interval") {
    // $FlowFixMe:
    return CURRENT_INTERVAL_NAME[filter[3]];
  }
  return null;
}

export default class FilterOptions extends Component {
  static propTypes = {
    filter: PropTypes.array.isRequired,
    onFilterChange: PropTypes.func.isRequired,
    // either an operator from schema_metadata or DatePicker
    operator: PropTypes.object.isRequired,
  };

  getOptions() {
    return (this.props.operator && this.props.operator.options) || {};
  }

  getOptionName(name) {
    if (OPTION_NAMES[name]) {
      return OPTION_NAMES[name](this.props.filter);
    }
    return name;
  }

  getOptionValue(name) {
    const { filter } = this.props;
    let value = getFilterOptions(filter)[name];
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
    MetabaseAnalytics.trackEvent("QueryBuilder", "Filter", "SetOption", name);
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
          <div
            key={name}
            className="flex align-center"
            onClick={() => this.toggleOptionValue(name)}
          >
            <CheckBox checked={this.getOptionValue(name)} />
            <label className="ml1">{this.getOptionName(name)}</label>
          </div>
        ))}
      </div>
    );
  }
}
