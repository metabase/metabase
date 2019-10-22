/* @flow */

import React, { Component } from "react";

import CopyButton from "./CopyButton";

type Props = {
  value: string,
};

export default class CopyWidget extends Component {
  props: Props;

  render() {
    const {
      value,
      style: { borderWidth, fontSize, ...style },
    } = this.props;
    return (
      <div className="flex" style={style}>
        <input
          className="flex-full p1 flex align-center text-medium text-bold no-focus border-top border-left border-bottom border-medium rounded-left"
          style={{ borderRight: "none", borderWidth, fontSize }}
          type="text"
          value={value}
          onClick={e => e.target.setSelectionRange(0, e.target.value.length)}
        />
        <CopyButton
          value={value}
          className="p1 flex align-center bordered border-medium rounded-right text-brand bg-brand-hover text-white-hover"
          style={{ borderWidth }}
        />
      </div>
    );
  }
}
