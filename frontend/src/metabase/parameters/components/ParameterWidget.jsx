/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import ParameterValueWidget from "./ParameterValueWidget";
import S from "./ParameterWidget.css";
import FieldSet from "../../components/FieldSet";

export default class ParameterWidget extends Component {
  state = {
    isFocused: false,
  };

  static propTypes = {
    parameter: PropTypes.object,
    commitImmediately: PropTypes.bool,
  };

  static defaultProps = {
    parameter: null,
    commitImmediately: false,
  };

  focusChanged = isFocused => {
    this.setState({ isFocused });
  };

  render() {
    const {
      className,
      parameter,
      isFullscreen,
      setValue,
      parameters,
      dashboard,
      commitImmediately,
    } = this.props;

    const fieldHasValueOrFocus =
      parameter.value != null || this.state.isFocused;
    const legend = fieldHasValueOrFocus ? parameter.name : "";

    return isFullscreen && parameter.value == null ? (
      <span className="hide" />
    ) : (
      <FieldSet
        legend={legend}
        noPadding={true}
        className={cx(className, S.container, {
          "border-brand": fieldHasValueOrFocus,
          "text-small": !isFullscreen,
        })}
      >
        <ParameterValueWidget
          parameter={parameter}
          parameters={parameters}
          dashboard={dashboard}
          name={name}
          value={parameter.value}
          setValue={setValue}
          placeholder={parameter.name}
          focusChanged={this.focusChanged}
          isFullscreen={isFullscreen}
          commitImmediately={commitImmediately}
        />
      </FieldSet>
    );
  }
}
