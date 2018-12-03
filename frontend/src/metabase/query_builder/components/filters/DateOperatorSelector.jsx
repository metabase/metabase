/* @flow */

import React, { Component } from "react";

import _ from "underscore";

import Select, { Option } from "metabase/components/Select";

import type { Operator } from "./pickers/DatePicker";

type Props = {
  operator: ?string,
  operators: Operator[],
  onOperatorChange: (o: Operator) => void,
  hideTimeSelectors?: boolean,
};

export default class DateOperatorSelector extends Component {
  props: Props;

  render() {
    const { operator, operators, onOperatorChange } = this.props;

    return (
      <div className="mx2 mb2 relative z3" style={{ minWidth: 100 }}>
        <Select
          value={_.findWhere(operators, { name: operator })}
          onChange={e => onOperatorChange(e.target.value)}
          width={150}
          compact
        >
          {operators.map(operator => (
            <Option key={operator.name} value={operator}>
              {operator.displayName}
            </Option>
          ))}
        </Select>
      </div>
    );
  }
}
