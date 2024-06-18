import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import ListSearchField from "metabase/components/ListSearchField";
import PopoverS from "metabase/components/Popover/Popover.module.css";
import CheckBox from "metabase/core/components/CheckBox";
import CS from "metabase/css/core/index.css";
import { capitalize } from "metabase/lib/formatting";
import { createMultiwordSearchRegex } from "metabase/lib/string";

import { SelectPickerButton } from "./SelectPicker.styled";

export default class SelectPicker extends Component {
  constructor(props) {
    super(props);

    this.state = {
      searchText: "",
      searchRegex: null,
    };
  }

  static propTypes = {
    options: PropTypes.array.isRequired,
    values: PropTypes.array.isRequired,
    onValuesChange: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
    multi: PropTypes.bool,
  };

  updateSearchText = value => {
    let regex = null;

    if (value) {
      regex = createMultiwordSearchRegex(value);
    }

    this.setState({
      searchText: value,
      searchRegex: regex,
    });
  };

  selectValue(key, selected) {
    let values;
    if (this.props.multi) {
      values = this.props.values.slice().filter(v => v != null);
    } else {
      values = [];
    }
    if (selected) {
      values.push(key);
    } else {
      values = values.filter(v => v !== key);
    }
    this.props.onValuesChange(values);
  }

  nameForOption(option) {
    if (option.name === "") {
      return t`Empty`;
    } else if (
      option.name instanceof String ||
      typeof option.name === "string"
    ) {
      return option.name;
    } else {
      return capitalize(String(option.name));
    }
  }

  render() {
    const { values, options, placeholder, multi } = this.props;

    const checked = new Set(values);

    let validOptions = [];
    const regex = this.state.searchRegex;

    if (regex) {
      for (const option of options) {
        if (regex.test(option.key) || regex.test(option.name)) {
          validOptions.push(option);
        }
      }
    } else {
      validOptions = options.slice();
    }

    return (
      <div data-testid="select-picker">
        {validOptions.length <= 10 && !regex ? null : (
          <div className={cx(CS.px1, CS.pt1)}>
            <ListSearchField
              fullWidth
              autoFocus
              onResetClick={() => this.updateSearchText("")}
              onChange={e => this.updateSearchText(e.target.value)}
              value={this.state.searchText}
              placeholder={t`Find a value`}
            />
          </div>
        )}
        <div
          className={cx(CS.px1, CS.pt1, PopoverS.PopoverBodyMarginBottom)}
          style={{ maxHeight: "400px", overflowY: "scroll" }}
        >
          {placeholder ? <h5>{placeholder}</h5> : null}
          {multi ? (
            <ul>
              {validOptions.map((option, index) => (
                <li key={index}>
                  <label
                    className={cx(
                      CS.flex,
                      CS.alignCenter,
                      CS.cursorPointer,
                      CS.p1,
                    )}
                    onClick={() =>
                      this.selectValue(option.key, !checked.has(option.key))
                    }
                  >
                    <CheckBox
                      checked={checked.has(option.key)}
                      checkedColor="accent2"
                    />
                    <h4 className={CS.ml1}>{this.nameForOption(option)}</h4>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <div className={cx(CS.flex, CS.flexWrap, CS.py1)}>
              {validOptions.map(option => (
                <div
                  key={option.key}
                  className={CS.half}
                  style={{ padding: "0.15em" }}
                >
                  <SelectPickerButton
                    isSelected={values[0] === option.key}
                    onClick={() => this.selectValue(option.key, true)}
                  >
                    {this.nameForOption(option)}
                  </SelectPickerButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
}
