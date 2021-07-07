import React from "react";
import PropTypes from "prop-types";

import _ from "underscore";

const DEBOUNCE_PERIOD = 300;

const propTypes = {
  parameters: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      placeholder: PropTypes.string.isRequired,
    }),
  ),
  children: PropTypes.func,
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
    const { parameters, children } = this.props;
    const { inputValues, committedValues } = this.state;
    return (
      <div>
        <div className="pt4">
          {parameters.map(({ key, placeholder }) => (
            <input
              className="input mr2"
              key={key}
              type="text"
              value={inputValues[key] || ""}
              placeholder={placeholder}
              onChange={e => {
                this.changeValue(key, e.target.value);
              }}
            />
          ))}
        </div>
        {children && children(committedValues)}
      </div>
    );
  }
}

AuditParameters.propTypes = propTypes;
