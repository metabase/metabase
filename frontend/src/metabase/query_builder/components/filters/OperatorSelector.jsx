/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import Select, { Option } from "metabase/core/components/Select";

import cx from "classnames";

export default class OperatorSelector extends Component {
  static propTypes = {
    operator: PropTypes.string,
    operators: PropTypes.array.isRequired,
    onOperatorChange: PropTypes.func.isRequired,
  };

  render() {
    const { operator, operators, onOperatorChange, className } = this.props;

    return (
      <Select
        value={operator}
        onChange={e => onOperatorChange(e.target.value)}
        className={cx("border-medium text-default", className)}
      >
        {operators.map(o => (
          <Option key={o.name} value={o.name}>
            {o.verboseName}
          </Option>
        ))}
      </Select>
    );
  }
}
