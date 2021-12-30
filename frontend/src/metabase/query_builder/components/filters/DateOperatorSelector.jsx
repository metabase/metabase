/* eslint-disable react/prop-types */
import React, { Component } from "react";

import _ from "underscore";
import cx from "classnames";

import Select, { Option } from "metabase/components/Select";

export default class DateOperatorSelector extends Component {
  render() {
    const { className, operator, operators, onOperatorChange } = this.props;

    return (
      <div className={cx(className, "relative z3")} style={{ minWidth: 100 }}>
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
