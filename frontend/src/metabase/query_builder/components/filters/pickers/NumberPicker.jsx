/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import TextPicker from "./TextPicker.jsx";

type Props = {
  values: Array<number | null>,
  onValuesChange: (values: any[]) => void,
  placeholder?: string,
  multi?: boolean,
  onCommit: () => void,
};

type State = {
  stringValues: Array<string>,
  validations: boolean[],
};

export default class NumberPicker extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
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

  _validate(values: Array<number | null>) {
    return values.map(v => v === undefined || !isNaN(v));
  }

  onValuesChange(stringValues: string[]) {
    let values = stringValues.map(v => parseFloat(v));
    this.props.onValuesChange(values.map(v => (isNaN(v) ? null : v)));
    this.setState({
      stringValues: stringValues,
      validations: this._validate(values),
    });
  }

  render() {
    // $FlowFixMe
    const values: Array<string | null> = this.state.stringValues.slice(
      0,
      this.props.values.length,
    );
    return (
      <TextPicker
        {...this.props}
        values={values}
        validations={this.state.validations}
        onValuesChange={values => this.onValuesChange(values)}
      />
    );
  }
}
