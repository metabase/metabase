/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";

import { TextPickerArea, TextPickerInput } from "./TextPicker.styled";

export default class TextPicker extends Component {
  static propTypes = {
    values: PropTypes.array.isRequired,
    onValuesChange: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
    validations: PropTypes.array,
    multi: PropTypes.bool,
    onCommit: PropTypes.func,
    isSingleLine: PropTypes.bool,
  };

  static defaultProps = {
    validations: [],
    placeholder: t`Enter desired text`,
    autoFocus: true,
  };

  constructor(props) {
    super(props);
    this.state = {
      fieldString: props.values.join(", "),
    };
  }

  setValue(fieldString) {
    if (fieldString != null) {
      // Only strip newlines from field string to not interfere with copy-pasting
      const newLineRegex = /\r?\n|\r/g;
      const newFieldString = fieldString.replace(newLineRegex, "");
      this.setState({ fieldString: newFieldString });

      // Construct the values array for real-time validation
      // Trim values to prevent confusing problems with leading/trailing whitespaces
      const newValues = newFieldString
        .split(",")
        .map(v => v.trim())
        .filter(v => v !== "");
      this.props.onValuesChange(newValues);
    } else {
      this.props.onValuesChange([]);
    }
  }

  render() {
    const {
      validations,
      multi,
      onCommit,
      isSingleLine,
      autoFocus,
      prefix,
      "data-testid": testId,
    } = this.props;
    const hasInvalidValues = _.some(validations, v => v === false);

    const commitOnEnter = e => {
      if (e.key === "Enter" && onCommit) {
        onCommit();
      }
    };

    return (
      <div data-testid={testId ?? "text-picker"}>
        <div
          className={cx(
            "FilterInput",
            CS.px1,
            CS.pt1,
            CS.relative,
            CS.flex,
            CS.alignCenter,
          )}
        >
          {!!prefix && (
            <span
              data-testid="input-prefix"
              className={cx(CS.textMedium, CS.px1)}
              style={{ marginRight: -30, width: 30, zIndex: 2 }}
            >
              {prefix}
            </span>
          )}
          {!isSingleLine && (
            <TextPickerArea
              className={cx(CS.block, CS.full, CS.input)}
              type="text"
              value={this.state.fieldString}
              onChange={e => this.setValue(e.target.value)}
              onKeyPress={commitOnEnter}
              placeholder={this.props.placeholder}
              autoFocus={autoFocus}
              style={{ resize: "none" }}
              maxRows={8}
              hasInvalidValues={hasInvalidValues}
            />
          )}

          {isSingleLine && (
            <TextPickerInput
              className={cx(CS.block, CS.full, CS.input)}
              style={{
                paddingLeft: this.props.prefix
                  ? `${this.props.prefix.length}.2rem`
                  : "",
              }}
              type="text"
              value={this.state.fieldString}
              onChange={e => this.setValue(e.target.value)}
              onKeyPress={commitOnEnter}
              placeholder={this.props.placeholder}
              autoFocus={autoFocus}
              hasInvalidValues={hasInvalidValues}
            />
          )}
        </div>

        {multi ? (
          <div className={cx(CS.p1, CS.textSmall)}>
            {t`You can enter multiple values separated by commas`}
          </div>
        ) : null}
      </div>
    );
  }
}
