/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";

import Select, { Option } from "metabase/core/components/Select";
import CS from "metabase/css/core/index.css";

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
        className={cx(CS.borderMedium, CS.textDefault, className)}
        data-testid="operator-select"
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
