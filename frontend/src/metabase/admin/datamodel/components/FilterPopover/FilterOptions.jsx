import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t, jt } from "ttag";

import CheckBox from "metabase/core/components/CheckBox";
import CS from "metabase/css/core/index.css";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import {
  getFilterOptions,
  setFilterOptions,
} from "metabase-lib/v1/queries/utils/filter";

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

function getCurrentIntervalName(filter) {
  if (filter[0] === "time-interval") {
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
      <div className={cx(CS.flex, CS.alignCenter)}>
        {options.map(([name, option]) => (
          <div key={name} className={cx(CS.flex, CS.alignCenter)}>
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
