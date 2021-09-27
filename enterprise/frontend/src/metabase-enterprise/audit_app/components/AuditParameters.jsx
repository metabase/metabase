import React from "react";
import PropTypes from "prop-types";

import Button from "metabase/components/Button";

import _ from "underscore";
import { AuditParametersInput } from "./AuditParameters.styled";

const DEBOUNCE_PERIOD = 300;

const propTypes = {
  parameters: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      placeholder: PropTypes.string.isRequired,
    }),
  ),
  buttons: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      onClick: PropTypes.func.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ),
  children: PropTypes.func,
  isBlank: PropTypes.bool,
};

export default class AuditParameters extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      inputValues: {},
      committedValues: {},
    };
  }

  changeValue = (key, value) => {
    this.setState({
      inputValues: { ...this.state.inputValues, [key]: value },
    });
    this.commitValueDebounced(key, value);
  };

  commitValueDebounced = _.debounce((key, value) => {
    this.setState({
      committedValues: { ...this.state.committedValues, [key]: value },
    });
  }, DEBOUNCE_PERIOD);

  render() {
    const { parameters, children, buttons, isBlank } = this.props;
    const { inputValues, committedValues } = this.state;

    const disabled =
      isBlank && inputValues && Object.keys(inputValues).length === 0;

    return (
      <div>
        <div className="pt4">
          {parameters.map(({ key, placeholder, icon }) => (
            <AuditParametersInput
              key={key}
              type="text"
              value={inputValues[key] || ""}
              placeholder={placeholder}
              disabled={disabled}
              onChange={value => {
                this.changeValue(key, value);
              }}
              icon={icon}
            />
          ))}
          {buttons?.map(({ key, onClick, label }) => (
            <Button
              primary
              key={key}
              onClick={onClick}
              disabled={disabled}
              className="ml2"
            >
              {label}
            </Button>
          ))}
        </div>
        {children && children(committedValues)}
      </div>
    );
  }
}

AuditParameters.propTypes = propTypes;
