/* eslint-disable react/prop-types */
import React, { Component } from "react";

import cx from "classnames";

import CopyButton from "./CopyButton";

export default class CopyWidget extends Component {
  render() {
    const { value, onChange, style, ...props } = this.props;
    return (
      <div className="flex relative" style={style}>
        <input
          className={cx("Form-input flex-full", { "no-focus": !onChange })}
          style={{
            paddingRight: 40,
          }}
          onClick={
            !onChange
              ? e => e.target.setSelectionRange(0, e.target.value.length)
              : null
          }
          value={value}
          onChange={onChange}
          {...props}
        />
        <CopyButton
          value={value}
          className="absolute top bottom right Form-input-border p1 flex align-center text-brand bg-brand-hover text-white-hover"
          style={{
            borderBottomLeftRadius: 0,
            borderTopLeftRadius: 0,
            borderTop: "none",
            borderRight: "none",
            borderBottom: "none",
          }}
        />
      </div>
    );
  }
}
