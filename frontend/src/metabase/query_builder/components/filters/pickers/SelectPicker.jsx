/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import CheckBox from "metabase/core/components/CheckBox";
import ListSearchField from "metabase/components/ListSearchField";

import { capitalize } from "metabase/lib/formatting";
import { createMultiwordSearchRegex } from "metabase/lib/string";

import cx from "classnames";

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
      <div>
        {validOptions.length <= 10 && !regex ? null : (
          <div className="px1 pt1">
            <ListSearchField
              hasClearButton
              onChange={this.updateSearchText}
              value={this.state.searchText}
              placeholder={t`Find a value`}
              autoFocus={true}
            />
          </div>
        )}
        <div
          className="px1 pt1 PopoverBody--marginBottom"
          style={{ maxHeight: "400px", overflowY: "scroll" }}
        >
          {placeholder ? <h5>{placeholder}</h5> : null}
          {multi ? (
            <ul>
              {validOptions.map((option, index) => (
                <li key={index}>
                  <label
                    className="flex align-center cursor-pointer p1"
                    onClick={() =>
                      this.selectValue(option.key, !checked.has(option.key))
                    }
                  >
                    <CheckBox
                      checked={checked.has(option.key)}
                      checkedColor="accent2"
                    />
                    <h4 className="ml1">{this.nameForOption(option)}</h4>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap py1">
              {validOptions.map(option => (
                <div
                  key={option.key}
                  className="half"
                  style={{ padding: "0.15em" }}
                >
                  <button
                    style={{ height: "95px" }}
                    className={cx(
                      "full rounded bordered border-purple text-centered text-bold",
                      {
                        "text-purple bg-white": values[0] !== option.key,
                        "text-white bg-purple": values[0] === option.key,
                      },
                    )}
                    onClick={() => this.selectValue(option.key, true)}
                  >
                    {this.nameForOption(option)}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
}
