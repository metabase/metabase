/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import Select, { Option } from "metabase/components/Select";

import cx from "classnames";

import type {
  FilterOperator,
  FilterOperatorName,
} from "metabase-types/types/Metadata";

type Props = {
  operator: string,
  operators: FilterOperator[],
  onOperatorChange: (name: FilterOperatorName) => void,
  className?: string,
};

export default class OperatorSelector extends Component {
  props: Props;

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
