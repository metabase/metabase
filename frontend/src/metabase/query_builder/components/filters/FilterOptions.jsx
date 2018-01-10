import React, { Component } from "react";

import { t, jt } from 'c-3po';

import CheckBox from "metabase/components/CheckBox";

import { getOperator } from "./pickers/DatePicker.jsx";


const CURRENT_INTERVAL_NAME = {
    "day":    t`today`,
    "week":   t`this week`,
    "month":  t`this month`,
    "year":   t`this year`,
    "minute": t`this minute`,
    "hour":   t`this hour`,
};

function getCurrentIntervalName(filter: FieldFilter): ?string {
  if (filter[0] === "time-interval") {
    // $FlowFixMe:
    return CURRENT_INTERVAL_NAME[filter[3]];
  }
  return null;
}

function getFilterOptions(filter: FieldFilter): FilterOptions {
  if (filter[0] === "time-interval") {
    // $FlowFixMe:
    const options: FilterOptions = filter[4] || {};
    return options;
  }
  return {};
}

function setFilterOptions<T: FieldFilter>(filter: T, options: FilterOptions): T {
  if (filter[0] === "time-interval") {
    // $FlowFixMe
    return [...filter.slice(0,4), options];
  } else {
    return filter;
  }
}

export default class FilterOptions extends Component {
  hasCurrentPeriod = () => {
      const { filter } = this.props;
      return getFilterOptions(filter)["include-current"] || false;
  }

  toggleCurrentPeriod = () => {
    const { filter } = this.props;
      const operator = getOperator(filter);

      if (operator && operator.options && operator.options["include-current"]) {
          const options = getFilterOptions(filter);
          this.props.onFilterChange(setFilterOptions(filter, {
            ...options,
            "include-current": !options["include-current"]
          }));
      }
  }

  render() {
    const { filter } = this.props;
    const operator = getOperator(filter);
    if (operator && operator.options && operator.options["include-current"]) {
      return (
        <div className="flex align-center" onClick={() => this.toggleCurrentPeriod()}>
            <CheckBox checked={this.hasCurrentPeriod()} />
            <label className="ml1">
                {jt`Include ${<b>{getCurrentIntervalName(filter)}</b>}`}
            </label>
        </div>
      )
    }
    return null;
  }
}
