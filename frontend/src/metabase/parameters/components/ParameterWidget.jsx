import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import ParameterValueWidget from "./ParameterValueWidget.jsx";
import Icon from "metabase/components/Icon.jsx";

import S from "./ParameterWidget.css";
import cx from "classnames";
import _ from "underscore";

import FieldSet from "../../components/FieldSet";

import { KEYCODE_ENTER, KEYCODE_ESCAPE } from "metabase/lib/keyboard";

export default class ParameterWidget extends Component {
  state = {
    isEditingName: false,
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
      parameters,
      isEditing,
      isFullscreen,
      editingParameter,
      setEditingParameter,
      setName,
      setValue,
      setDefaultValue,
      remove,
      children,
    } = this.props;

    const isEditingDashboard = isEditing;
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

    const renderEditFieldNameUI = () => {
      return (
        <FieldSet
          legend=""
          noPadding={true}
          className={cx(className, S.container)}
        >
          <input
            type="text"
            className={cx(S.nameInput, {
              "border-error": _.any(
                parameters,
                p => p.name === parameter.name && p.id !== parameter.id,
              ),
            })}
            value={parameter.name}
            onChange={e => setName(e.target.value)}
            onBlur={() => this.setState({ isEditingName: false })}
            onKeyUp={e => {
              if (e.keyCode === KEYCODE_ESCAPE || e.keyCode === KEYCODE_ENTER) {
                e.target.blur();
              }
            }}
            autoFocus
          />
          {children}
        </FieldSet>
      );
    };

    const renderSetDefaultFieldValueUI = () => {
      const editNameButton = (
        <span className={S.editNameIconContainer}>
          <Icon
            name="pencil"
            size={12}
            className="text-brand cursor-pointer"
            onClick={() => this.setState({ isEditingName: true })}
          />
        </span>
      );

      const legend = (
        <span>
          {parameter.name} {editNameButton}
        </span>
      );

      return (
        <FieldSet
          legend={legend}
          noPadding={true}
          className={cx(className, S.container)}
        >
          {this.renderPopover(
            parameter.default,
            value => setDefaultValue(value),
            parameter.name,
            isFullscreen,
          )}
          {children}
        </FieldSet>
      );
    };

    const renderFieldEditingButtons = () => {
      return (
        <FieldSet
          legend={parameter.name}
          noPadding={true}
          className={cx(className, S.container)}
        >
          <div className={cx(S.parameter, S.parameterButtons)}>
            <div
              className={S.editButton}
              onClick={() => setEditingParameter(parameter.id)}
            >
              <Icon name="pencil" />
              <span className="ml1">{t`Edit`}</span>
            </div>
            <div className={S.removeButton} onClick={() => remove()}>
              <Icon name="close" />
              <span className="ml1">{t`Remove`}</span>
            </div>
          </div>
          {children}
        </FieldSet>
      );
    };

    if (isFullscreen) {
      if (parameter.value != null) {
        return (
          <div style={{ fontSize: "0.833em" }}>{renderFieldInNormalMode()}</div>
        );
      } else {
        return <span className="hide" />;
      }
    } else if (!isEditingDashboard || !setEditingParameter) {
      return renderFieldInNormalMode();
    } else if (isEditingParameter) {
      if (this.state.isEditingName) {
        return renderEditFieldNameUI();
      } else {
        return renderSetDefaultFieldValueUI();
      }
    } else {
      return renderFieldEditingButtons();
    }
  }
}
