/* @flow */

import React, { Component } from "react";
import cx from "classnames";
import { t } from "c-3po";
import DatePicker, {
  DATE_OPERATORS,
  getOperator,
} from "metabase/query_builder/components/filters/pickers/DatePicker.jsx";
import FilterOptions from "metabase/query_builder/components/filters/FilterOptions.jsx";
import { generateTimeFilterValuesDescriptions } from "metabase/lib/query_time";
import { dateParameterValueToMBQL } from "metabase/meta/Parameter";

import type { OperatorName } from "metabase/query_builder/components/filters/pickers/DatePicker.jsx";
import type { FieldFilter } from "metabase/meta/types/Query";

type UrlEncoded = string;

// Use a placeholder value as field references are not used in dashboard filters
// $FlowFixMe
const noopRef: LocalFieldReference = null;

function getFilterValueSerializer(
  func: (val1: string, val2: string) => UrlEncoded,
) {
  // $FlowFixMe
  return filter => func(filter[2], filter[3], filter[4] || {});
}

const serializersByOperatorName: {
  [id: OperatorName]: (FieldFilter) => UrlEncoded,
} = {
  previous: getFilterValueSerializer(
    (value, unit, options = {}) =>
      // $FlowFixMe
      `past${-value}${unit}s${options["include-current"] ? "~" : ""}`,
  ),
  next: getFilterValueSerializer(
    (value, unit, options = {}) =>
      `next${value}${unit}s${options["include-current"] ? "~" : ""}`,
  ),
  current: getFilterValueSerializer((_, unit) => `this${unit}`),
  before: getFilterValueSerializer(value => `~${value}`),
  after: getFilterValueSerializer(value => `${value}~`),
  on: getFilterValueSerializer(value => `${value}`),
  between: getFilterValueSerializer((from, to) => `${from}~${to}`),
};

function getFilterOperator(filter) {
  return DATE_OPERATORS.find(op => op.test(filter));
}
function filterToUrlEncoded(filter: FieldFilter): ?UrlEncoded {
  const operator = getFilterOperator(filter);

  if (operator) {
    return serializersByOperatorName[operator.name](filter);
  } else {
    return null;
  }
}

const prefixedOperators: Set<OperatorName> = new Set([
  "before",
  "after",
  "on",
  "empty",
  "not-empty",
]);
function getFilterTitle(filter) {
  const desc = generateTimeFilterValuesDescriptions(filter).join(" - ");
  const op = getFilterOperator(filter);
  const prefix =
    op && prefixedOperators.has(op.name) ? `${op.displayName} ` : "";
  return prefix + desc;
}

type Props = {
  setValue: (value: ?string) => void,
  onClose: () => void,
};

type State = { filter: FieldFilter };

export default class DateAllOptionsWidget extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);

    this.state = {
      filter:
        props.value != null
          ? // $FlowFixMe
            dateParameterValueToMBQL(props.value, noopRef) || []
          : // $FlowFixMe
            [],
    };
  }

  static propTypes = {};
  static defaultProps = {};

  static format = (urlEncoded: ?string) => {
    if (urlEncoded == null) {
      return null;
    }
    const filter = dateParameterValueToMBQL(urlEncoded, noopRef);

    return filter ? getFilterTitle(filter) : null;
  };

  commitAndClose = () => {
    this.props.setValue(filterToUrlEncoded(this.state.filter));
    this.props.onClose();
  };

  setFilter = (filter: FieldFilter) => {
    this.setState({ filter });
  };

  isValid() {
    const filterValues = this.state.filter.slice(2);
    return filterValues.every(value => value != null);
  }

  render() {
    const { filter } = this.state;
    return (
      <div style={{ minWidth: "300px" }}>
        <DatePicker
          filter={this.state.filter}
          onFilterChange={this.setFilter}
          hideEmptinessOperators
          hideTimeSelectors
        />
        <div className="FilterPopover-footer border-top flex align-center p2">
          <FilterOptions
            filter={filter}
            onFilterChange={this.setFilter}
            operator={getOperator(filter)}
          />
          <button
            className={cx("Button Button--purple ml-auto", {
              disabled: !this.isValid(),
            })}
            onClick={this.commitAndClose}
          >
            {t`Update filter`}
          </button>
        </div>
      </div>
    );
  }
}
