/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import Select, { Option } from "metabase/components/Select";

import cx from "classnames";

import type {
  FieldMetadata,
  FilterOperator,
  FilterOperatorName,
} from "metabase-types/types/Metadata";

type Props = {
  field: FieldMetadata,
  operator: string,
  operators: FilterOperator[],
  onOperatorChange: (name: FilterOperatorName) => void,
  className?: string,
};

export default class OperatorSelector extends Component {
  props: Props;

  static propTypes = {
    field: PropTypes.object.isRequired,
    operator: PropTypes.string,
    operators: PropTypes.array.isRequired,
    onOperatorChange: PropTypes.func.isRequired,
  };

  render() {
    const {
      field,
      operator,
      operators,
      onOperatorChange,
      className,
    } = this.props;

    let filtered_operators = operators;
    if (field["base_type"] === "type/Text") {
      // Text fields should only have is-null / not-null if it was already selected
      if (operator === "is-null") {
        filtered_operators = operators.filter(o => o["name"] !== "not-null");
      } else if (operator === "not-null") {
        filtered_operators = operators.filter(o => o["name"] !== "is-null");
      } else {
        filtered_operators = operators.filter(
          o => o["name"] !== "is-null" && o["name"] !== "not-null",
        );
      }
    }

    return (
      <Select
        value={operator}
        onChange={e => onOperatorChange(e.target.value)}
        className={cx("border-medium text-default", className)}
      >
        {filtered_operators.map(o => (
          <Option key={o.name} value={o.name}>
            {o.verboseName}
          </Option>
        ))}
      </Select>
    );
  }
}
