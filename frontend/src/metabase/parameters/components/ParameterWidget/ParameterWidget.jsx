/* eslint-disable react/prop-types */
import PropTypes from "prop-types";
import { Component } from "react";

import { Sortable } from "metabase/core/components/Sortable";
import CS from "metabase/css/core/index.css";

import ParameterValueWidget from "../ParameterValueWidget";

import {
  ParameterContainer,
  ParameterFieldSet,
  SettingsIcon,
} from "./ParameterWidget.styled";

export class ParameterWidget extends Component {
  state = {
    isEditingName: false,
    editingNameValue: undefined,
    isFocused: false,
  };

  static propTypes = {
    parameter: PropTypes.object,
    commitImmediately: PropTypes.bool,
    setParameterValueToDefault: PropTypes.func,
    enableParameterRequiredBehavior: PropTypes.bool,
  };

  static defaultProps = {
    parameter: null,
    commitImmediately: false,
    isSortable: false,
  };

  renderPopover(value, setValue, placeholder, isFullscreen) {
    const {
      question,
      dashboard,
      parameter,
      editingParameter,
      commitImmediately,
      parameters,
      setParameterValueToDefault,
      enableParameterRequiredBehavior,
      isSortable,
      isEditing,
    } = this.props;

    const isEditingParameter = editingParameter?.id === parameter.id;

    return (
      <ParameterValueWidget
        parameter={parameter}
        parameters={parameters}
        question={question}
        dashboard={dashboard}
        name={name}
        value={value}
        setValue={setValue}
        isEditing={isEditingParameter}
        placeholder={placeholder}
        focusChanged={this.focusChanged}
        isFullscreen={isFullscreen}
        commitImmediately={commitImmediately}
        setParameterValueToDefault={setParameterValueToDefault}
        enableRequiredBehavior={enableParameterRequiredBehavior}
        isSortable={isSortable && isEditing}
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
      enableParameterRequiredBehavior,
    } = this.props;

    const isEditingParameter =
      editingParameter && editingParameter.id === parameter.id;

    const renderFieldInNormalMode = () => {
      const fieldHasValueOrFocus =
        parameter.value != null || this.state.isFocused;
      const legend = fieldHasValueOrFocus ? parameter.name : "";

      return (
        <ParameterFieldSet
          legend={legend}
          required={enableParameterRequiredBehavior && parameter.required}
          noPadding={true}
          fieldHasValueOrFocus={fieldHasValueOrFocus}
          className={className}
        >
          {this.renderPopover(
            parameter.value,
            value => setValue(value),
            parameter.name,
            isFullscreen,
          )}
          {children}
        </ParameterFieldSet>
      );
    };

    const renderEditing = () => (
      <Sortable
        id={parameter.id}
        draggingStyle={{ opacity: 0.5 }}
        disabled={!isEditing}
        role="listitem"
      >
        <ParameterContainer
          isEditingParameter={isEditingParameter}
          onClick={() =>
            setEditingParameter(isEditingParameter ? null : parameter.id)
          }
        >
          <div className={CS.mr1} onClick={e => e.stopPropagation()}>
            {dragHandle}
          </div>
          {parameter.name}
          <SettingsIcon name="gear" size={16} />
        </ParameterContainer>
      </Sortable>
    );

    if (isFullscreen) {
      return (
        <div style={{ fontSize: "0.833em" }}>{renderFieldInNormalMode()}</div>
      );
    } else if (isEditing && setEditingParameter) {
      return renderEditing();
    } else {
      return renderFieldInNormalMode();
    }
  }
}
