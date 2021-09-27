import React from "react";
import PropTypes from "prop-types";

import Button from "metabase/components/Button";

import _ from "underscore";

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
  enabled: PropTypes.bool,
};

export default class AuditParameters extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      inputValues: {},
      committedValues: {},
    };
  }

  changeValue = (key: string, value: string) => {
    this.setState({
      inputValues: { ...this.state.inputValues, [key]: value },
    });
    this.commitValueDebounced(key, value);
  };

  commitValueDebounced = _.debounce((key: string, value: string) => {
    this.setState({
      committedValues: { ...this.state.committedValues, [key]: value },
    });
  }, DEBOUNCE_PERIOD);

  render() {
    const { parameters, children, buttons, enabled } = this.props;
    const { inputValues, committedValues } = this.state;

    // What's given as "enabled" is really the 0 rows returned,
    // so we have to check for 0 rows returned with null param search
    const disabled =
      !enabled && inputValues && Object.keys(inputValues).length === 0;

    return (
      <div>
        <div className="pt4">
          {parameters &&
            parameters.map(({ key, placeholder }) => (
              <input
                className="input mr2"
                key={key}
                type="text"
                value={inputValues[key] || ""}
                placeholder={placeholder}
                disabled={disabled}
                onChange={e => {
                  this.changeValue(key, e.target.value);
                }}
              />
            ))}
          {buttons &&
            buttons.map(({ key, onClick, label }) => (
              <Button primary key={key} onClick={onClick} disabled={disabled}>
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
