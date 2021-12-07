/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import AutosizeTextarea from "react-textarea-autosize";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";

export default class TextPicker extends Component {
  static propTypes = {
    values: PropTypes.array.isRequired,
    onValuesChange: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
    validations: PropTypes.array,
    multi: PropTypes.bool,
    onCommit: PropTypes.func,
  };

  static defaultProps = {
    validations: [],
    placeholder: t`Enter desired text`,
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
    const { validations, multi, onCommit } = this.props;
    const hasInvalidValues = _.some(validations, v => v === false);

    const commitOnEnter = e => {
      if (e.key === "Enter" && onCommit) {
        onCommit();
      }
    };

    return (
      <div>
        <div className="FilterInput px1 pt1 relative">
          <AutosizeTextarea
            className={cx("input block full border-purple", {
              "border-error": hasInvalidValues,
            })}
            type="text"
            value={this.state.fieldString}
            onChange={e => this.setValue(e.target.value)}
            onKeyPress={commitOnEnter}
            placeholder={this.props.placeholder}
            autoFocus={true}
            style={{ resize: "none" }}
            maxRows={8}
          />
        </div>

        {multi ? (
          <div className="p1 text-small">
            {t`You can enter multiple values separated by commas`}
          </div>
        ) : null}
      </div>
    );
  }
}
