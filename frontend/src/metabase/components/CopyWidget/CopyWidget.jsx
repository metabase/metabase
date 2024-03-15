/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";

import InputS from "metabase/css/core/inputs.module.css";

import { CopyWidgetButton } from "./CopyWidget.styled";

export default class CopyWidget extends Component {
  render() {
    const { value, onChange, style, ...props } = this.props;
    return (
      <div className="flex relative" style={style}>
        <input
          className={cx("Form-input flex-full", {
            [InputS.noFocus]: !onChange,
          })}
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
          readOnly={value && !onChange}
          {...props}
        />
        <CopyWidgetButton value={value} />
      </div>
    );
  }
}
