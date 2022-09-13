/* eslint-disable react/prop-types */
import React, { Component } from "react";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

const ChartSettingNumericInput = styled.input`
  font-size: 0.875rem;
  border: 1px solid ${props => (props.error ? color("error") : color("border"))};
  border-radius: 0.5rem;
  color: ${color("text-dark")};
  padding: 0.625rem 0.75rem;
  display: block;
  width: 100%;
  transition: border 0.3s;
  font-weight: 700;
`;

export default class ChartSettingInputNumeric extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      value: String(props.value == null ? "" : props.value),
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    this.setState({
      value: String(nextProps.value == null ? "" : nextProps.value),
    });
  }

  render() {
    const { onChange, ...props } = this.props;
    return (
      <ChartSettingNumericInput
        type="number"
        {...props}
        error={this.state.value !== "" && isNaN(parseFloat(this.state.value))}
        value={this.state.value}
        onChange={e => {
          const num = parseFloat(e.target.value);
          if (!isNaN(num) && num !== this.props.value) {
            onChange(num);
          }
          this.setState({ value: e.target.value });
        }}
        onBlur={e => {
          const num = parseFloat(e.target.value);
          if (isNaN(num)) {
            onChange(undefined);
          } else {
            onChange(num);
          }
        }}
      />
    );
  }
}
