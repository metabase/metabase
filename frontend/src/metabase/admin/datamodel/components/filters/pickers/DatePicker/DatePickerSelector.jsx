/* eslint-disable react/prop-types */
import { Component } from "react";
import _ from "underscore";

import Select, { Option } from "metabase/core/components/Select";

export default class DatePickerSelector extends Component {
  render() {
    const { className, operator, operators, onOperatorChange } = this.props;

    return (
      <div className={className} style={{ minWidth: 100 }}>
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
