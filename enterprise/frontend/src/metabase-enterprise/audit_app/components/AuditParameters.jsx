/* @flow */

import React from "react";

import _ from "underscore";

const DEBOUNCE_PERIOD = 300;

type AuditParameter = {
  key: string,
  placeholder: string,
};

type Props = {
  parameters: AuditParameter[],
  children?: (committedValues: { [key: string]: string }) => React$Element<any>,
};

type State = {
  inputValues: { [key: string]: string },
  committedValues: { [key: string]: string },
};

export default class AuditParameters extends React.Component {
  props: Props;
  state: State;

  constructor(props: Props) {
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
              className="input"
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
