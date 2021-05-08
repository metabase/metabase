/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import ParameterValueWidget from "./ParameterValueWidget";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

import S from "./ParameterWidget.css";
import cx from "classnames";

import FieldSet from "../../components/FieldSet";

export default class ParameterWidget extends Component {
  state = {
    isEditingName: false,
    editingNameValue: undefined,
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

  renderPopover(value, setValue, placeholder, isFullscreen) {
    const { parameter, editingParameter, commitImmediately } = this.props;
    const isEditingParameter = !!(
      editingParameter && editingParameter.id === parameter.id
    );
    return (
      <ParameterValueWidget
        parameter={parameter}
        parameters={this.props.parameters}
        dashboard={this.props.dashboard}
        name={name}
        value={value}
        setValue={setValue}
        isEditing={isEditingParameter}
        placeholder={placeholder}
        focusChanged={this.focusChanged}
        isFullscreen={isFullscreen}
        commitImmediately={commitImmediately}
      />
    );
  }

  focusChanged = isFocused => {
    this.setState({ isFocused });
  };

  render() {
    const {
      className,
      parameter,
      isEditing,
      isFullscreen,
      editingParameter,
      setEditingParameter,
      setValue,
      children,
      dragHandle,
    } = this.props;

    const isEditingParameter =
      editingParameter && editingParameter.id === parameter.id;

    const renderFieldInNormalMode = () => {
      const fieldHasValueOrFocus =
        parameter.value != null || this.state.isFocused;
      const legend = fieldHasValueOrFocus ? parameter.name : "";

      return (
        <FieldSet
          legend={legend}
          noPadding={true}
          className={cx(className, S.container, {
            "border-brand": fieldHasValueOrFocus,
          })}
        >
          {this.renderPopover(
            parameter.value,
            value => setValue(value),
            parameter.name,
            isFullscreen,
          )}
          {children}
        </FieldSet>
      );
    };

    const renderEditing = () => (
      <div
        className={cx(
          className,
          "flex align-center bordered rounded cursor-pointer text-bold mr1 mb1",
          {
            "bg-brand text-white": isEditingParameter,
            "text-brand-hover bg-white": !isEditingParameter,
          },
        )}
        onClick={() =>
          setEditingParameter(isEditingParameter ? null : parameter.id)
        }
        style={{
          padding: 8,
          width: 170,
          borderColor: isEditingParameter && color("brand"),
        }}
      >
        <div className="mr1" onClick={e => e.stopPropagation()}>
          {dragHandle}
        </div>
        {parameter.name}
        <Icon className="flex-align-right" name="gear" />
      </div>
    );

    if (isFullscreen) {
      if (parameter.value != null) {
        return (
          <div style={{ fontSize: "0.833em" }}>{renderFieldInNormalMode()}</div>
        );
      } else {
        return <span className="hide" />;
      }
    } else if (isEditing && setEditingParameter) {
      return renderEditing();
    } else {
      return renderFieldInNormalMode();
    }
  }
}
