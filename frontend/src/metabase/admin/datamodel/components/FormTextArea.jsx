import React, { Component } from "react";

import cx from "classnames";

import { formDomOnlyProps } from "metabase/lib/redux";

export default class FormTextArea extends Component {
  static propTypes = {};

  render() {
    const { field, className, placeholder } = this.props;
    return (
      <textarea
        placeholder={placeholder}
        className={cx(
          "input full",
          { "border-error": !field.active && field.visited && field.invalid },
          className,
        )}
        {...formDomOnlyProps(field)}
      />
    );
  }
}
