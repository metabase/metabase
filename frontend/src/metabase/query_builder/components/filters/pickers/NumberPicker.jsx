/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import TextPicker from "./TextPicker";
import { isCurrency } from "metabase/lib/schema_metadata";
import { getCurrencySymbol } from "metabase/lib/formatting";

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

  extractFieldSettings = field => {
    const fieldId = field?.id;
    const fieldMetadata = field?.metadata?.fields[fieldId];
    return fieldMetadata?.settings;
  };

  render() {
    const values = this.state.stringValues.slice(0, this.props.values.length);

    const fieldSettings = this.extractFieldSettings(this.props.field);
    const currencyPrefix =
      isCurrency(this.props.field) && fieldSettings?.currency
        ? getCurrencySymbol(fieldSettings.currency)
        : null;

    return (
      <TextPicker
        {...this.props}
        isSingleLine
        prefix={currencyPrefix}
        values={values}
        validations={this.state.validations}
        onValuesChange={values => this.onValuesChange(values)}
      />
    );
  }
}
