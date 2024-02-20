/* eslint-disable react/prop-types */
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import TextPicker from "./TextPicker";

export default class NumberPicker extends Component {
  constructor(props) {
    super(props);
    this.state = {
      stringValues: props.values.map(v => {
        if (typeof v === "number") {
          return String(v);
        } else {
          return String(v || "");
        }
      }),
      validations: this._validate(props.values),
    };
  }

  static propTypes = {
    values: PropTypes.array.isRequired,
    onValuesChange: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
    multi: PropTypes.bool,
  };

  static defaultProps = {
    placeholder: t`Enter desired number`,
  };

  _validate(values) {
    return values.map(v => v === undefined || !isNaN(v));
  }

  onValuesChange(stringValues) {
    const values = stringValues.map(v => parseFloat(v));
    this.props.onValuesChange(values.map(v => (isNaN(v) ? null : v)));
    this.setState({
      stringValues: stringValues,
      validations: this._validate(values),
    });
  }

  render() {
    const values = this.state.stringValues.slice(0, this.props.values.length);
    return (
      <TextPicker
        {...this.props}
        data-testid="number-picker"
        isSingleLine
        prefix={this.props.prefix}
        values={values}
        validations={this.state.validations}
        onValuesChange={values => this.onValuesChange(values)}
      />
    );
  }
}
