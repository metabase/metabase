import { Component } from "react";
import { t } from "ttag";
import type Filter from "metabase-lib/v1/queries/structured/Filter";

import TextPicker from "./TextPicker";

interface NumberPickerProps {
  values: number[];
  onValuesChange: (values: (number | null)[]) => void;
  placeholder?: string;
  multi?: boolean;
  prefix?: string;
  autoFocus?: boolean;
  onCommit: (filter: Filter) => void;
}

interface NumberPickerState {
  stringValues: string[];
  validations: boolean[];
}

export default class NumberPicker extends Component<
  NumberPickerProps,
  NumberPickerState
> {
  constructor(props: NumberPickerProps) {
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

  static defaultProps = {
    placeholder: t`Enter desired number`,
  };

  _validate(values: number[]) {
    return values.map(v => v === undefined || !isNaN(v));
  }

  onValuesChange(stringValues: string[]) {
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
        onValuesChange={(values: string[]) => this.onValuesChange(values)}
      />
    );
  }
}
