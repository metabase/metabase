/* @flow */

import React, { Component } from "react";

import CopyButton from "./CopyButton";

type Props = {
  value: string,
};

export default class CopyWidget extends Component {
  props: Props;

  render() {
    const { value } = this.props;
    return (
      <div className="flex">
        <input
          className="flex-full p1 flex align-center text-medium text-bold no-focus border-top border-left border-bottom border-med rounded-left"
          style={{ borderRight: "none" }}
          type="text"
          value={value}
          onClick={e => e.target.setSelectionRange(0, e.target.value.length)}
        />
        <CopyButton
          className="p1 flex align-center bordered border-med rounded-right text-brand bg-brand-hover text-white-hover"
          value={value}
        />
      </div>
    );
  }
}
