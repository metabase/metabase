/* eslint-disable react/prop-types */
import { Component } from "react";
import PropTypes from "prop-types";
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
  };

  static defaultProps = {
    parameter: null,
    commitImmediately: false,
  };

  renderPopover(value, setValue, placeholder, isFullscreen) {
    const {
      question,
      dashboard,
      parameter,
      editingParameter,
      commitImmediately,
      parameters,
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
        <ParameterFieldSet
          legend={legend}
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
      <ParameterContainer
        isEditingParameter={isEditingParameter}
        onClick={() =>
          setEditingParameter(isEditingParameter ? null : parameter.id)
        }
      >
        <div className="mr1" onClick={e => e.stopPropagation()}>
          {dragHandle}
        </div>
        {parameter.name}
        <SettingsIcon name="gear" size={16} />
      </ParameterContainer>
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
