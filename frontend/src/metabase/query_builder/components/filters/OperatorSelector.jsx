/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import Select, { Option } from "metabase/components/Select";

import type { Operator, OperatorName } from "metabase/meta/types/Metadata";

type Props = {
  operator: string,
  operators: Operator[],
  onOperatorChange: (name: OperatorName) => void,
};

export default class OperatorSelector extends Component {
  props: Props;

  static propTypes = {
    operator: PropTypes.string,
    operators: PropTypes.array.isRequired,
    onOperatorChange: PropTypes.func.isRequired,
  };

  render() {
    let { operator, operators, onOperatorChange } = this.props;

    return (
      <Select
        value={operator}
        onChange={e => onOperatorChange(e.target.value)}
        className="border-medium"
      >
        {operators.map(o => (
          <Option key={o.name} value={o.name}>
            {o.verboseName}
          </Option>
        ))}
      </Select>
    );

    // return (
    //   <div
    //     id="OperatorSelector"
    //     className="p1"
    //     style={{
    //       maxWidth: 300,
    //     }}
    //   >
    //     {operators.map(o => (
    //       <button
    //         key={o.name}
    //         className={cx(
    //           "Button Button-normal Button--medium mr1 mb1 text-purple-hover",
    //           {
    //             "Button--purple": o.name === operator,
    //           },
    //         )}
    //         onClick={() => this.props.onOperatorChange(o.name)}
    //       >
    //         {o.verboseName}
    //       </button>
    //     ))}
    //   </div>
    // );
  }
}
