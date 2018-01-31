/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { findDOMNode } from "react-dom";
import _ from "underscore";
import cx from "classnames";

import OnClickOutsideWrapper from 'metabase/components/OnClickOutsideWrapper';
import Icon from "metabase/components/Icon";
import Popover from "metabase/components/Popover";

import {
    KEYCODE_ESCAPE,
    KEYCODE_ENTER,
    KEYCODE_COMMA,
    KEYCODE_TAB,
    KEYCODE_UP,
    KEYCODE_DOWN,
    KEYCODE_BACKSPACE
} from "metabase/lib/keyboard";

// somewhat matches react-select's API: https://github.com/JedWatson/react-select
export default class RecipientPicker extends Component {
    constructor(props) {
        super(props);

        this.state = {
            inputValue: "",
            filteredOptions: [],
            selectedOptionValue: null,
            focused: props.autoFocus
        };
    }

    static propTypes = {
        value: PropTypes.array,
        options: PropTypes.array,
        placeholder: PropTypes.string,
        autoFocus: PropTypes.bool,

        valueKey: PropTypes.string,
        labelKey: PropTypes.string,

        removeSelected: PropTypes.bool,
        filterOption: PropTypes.func,

        onChange: PropTypes.func.isRequired,
        onInputChange: PropTypes.func,
        onInputKeyDown: PropTypes.func,
        onAddFreeform: PropTypes.func,

        valueRenderer: PropTypes.func.isRequired, // TODO: default
        optionRenderer: PropTypes.func.isRequired, // TODO: default
        layoutRenderer: PropTypes.func,
    };

    static defaultProps = {
        removeSelected: true,
        layoutRenderer: (props) => <DefaultTokenFieldLayout {...props} />,
        valueKey: "value",
        labelKey: "label"
    };

    componentWillReceiveProps(nextProps, nextState) {
      this._updateFilteredValues()
    }

    setInputValue(inputValue) {
        this.setState({
            inputValue
        }, this._updateFilteredValues);
    }

    _updateFilteredValues = () => {
      const { options, value, removeSelected, filterOption, valueKey } = this.props;
      let { inputValue, selectedOptionValue } = this.state;
      let selectedValues = new Set(value.map(v => JSON.stringify(v)));

      let filteredOptions = options.filter(option =>
          // filter out options who have already been selected
          (!removeSelected || !selectedValues.has(JSON.stringify(option[valueKey]))) &&
          filterOption(option, inputValue)
      );

      if (selectedOptionValue == null || !_.find(filteredOptions, (option) => this._valueIsEqual(selectedOptionValue, option[valueKey]))) {
          // if there are results based on the user's typing...
          if (filteredOptions.length > 0) {
              // select the first option in the list and set the selected option to that
              selectedOptionValue = filteredOptions[0][valueKey];
          } else {
              selectedOptionValue = null;
          }
      }

      this.setState({
          filteredOptions,
          selectedOptionValue
      });
    }

    onInputChange = ({ target: { value } }) => {
        if (this.props.onInputChange) {
          value = this.props.onInputChange(value);
        }
        this.setInputValue(value);
    }

    // capture events on the input to allow for convenient keyboard shortcuts
    onInputKeyDown = (event) => {
        if (this.props.onInputKeyDown) {
          this.props.onInputKeyDown(event);
        }

        const keyCode = event.keyCode

        const { valueKey } = this.props;
        const { filteredOptions, selectedOptionValue } = this.state

        // enter, tab, comma
        if (keyCode === KEYCODE_ESCAPE || keyCode === KEYCODE_TAB || keyCode === KEYCODE_COMMA || keyCode === KEYCODE_ENTER) {
            this.addSelectedOption();
        }

        // up arrow
        else if (event.keyCode === KEYCODE_UP) {
            event.preventDefault();
            let index = _.findIndex(filteredOptions, (option) => this._valueIsEqual(selectedOptionValue, option[valueKey]));
            if (index > 0) {
                this.setState({ selectedOptionValue: filteredOptions[index - 1][valueKey] });
            }
        }

        // down arrow
        else if (keyCode === KEYCODE_DOWN) {
            event.preventDefault();
            let index = _.findIndex(filteredOptions, (option) => this._valueIsEqual(selectedOptionValue, option[valueKey]));
            if (index >= 0 && index < filteredOptions.length - 1) {
                this.setState({ selectedOptionValue: filteredOptions[index + 1][valueKey] });
            }
        }

        // backspace
        else if (keyCode === KEYCODE_BACKSPACE) {
            let { value } = this.props;
            if (!this.state.inputValue && value.length > 0) {
                this.removeValue(value[value.length - 1])
            }
        }
    }

    onInputFocus = () => {
        this.setState({ focused: true });
    }

    onInputBlur = () => {
        setTimeout(() => {
          this.setState({ inputValue: "", focused: false });
        }, 100)
    }

    onMouseDownCapture = (e) => {
        let input = findDOMNode(this.refs.input);
        input.focus();
        // prevents clicks from blurring input while still allowing text selection:
        if (input !== e.target) {
            e.preventDefault();
        }
    }

    onClose = () => {
        this.setState({ focused: false });
    }

    addSelectedOption() {
        const { valueKey } = this.props
        const { selectedOptionValue } = this.state;
        let input = findDOMNode(this.refs.input);
        let option = _.find(this.state.filteredOptions, (option) => this._valueIsEqual(selectedOptionValue, option[valueKey]));
        if (option) {
            this.addOption(option);
        } else if (this.props.onAddFreeform) {
            const value = this.props.onAddFreeform(input.value);
            if (value) {
                this.addValue(value);
            }
        }
    }

    addOption = (option) => {
        const { valueKey } = this.props
        // add the option's value to the current value
        this.addValue(option[valueKey]);
    }

    addValue(valueToAdd) {
        const { value, onChange } = this.props
        onChange(value.concat(valueToAdd));
        // reset the input value
        this.setInputValue("");
    }

    removeValue(valueToRemove) {
        const { value, onChange } = this.props
        onChange(value.filter(v => !this._valueIsEqual(v, valueToRemove)));
        // reset the input value
        this.setInputValue("");
    }

    _valueIsEqual(v1, v2) {
      return JSON.stringify(v1) === JSON.stringify(v2);
    }

    render() {
        const { filteredOptions, inputValue, focused, selectedOptionValue } = this.state;
        const { placeholder, value, valueKey, optionRenderer, valueRenderer, layoutRenderer } = this.props;

        const valuesList =
          <ul className={cx("px1 pb1 bordered rounded flex flex-wrap bg-white", { "input--focus": this.state.focused })} onMouseDownCapture={this.onMouseDownCapture}>
              {value.map((v, index) =>
                  <li className="mr1 py1 pl1 mt1 rounded bg-grey-1">
                      <span className="h4 text-bold">
                        {valueRenderer(v)}
                      </span>
                      <a
                          className="text-grey-2 text-grey-4-hover px1"
                          onClick={() => this.removeValue(v)}
                      >
                          <Icon name="close" className="" size={12} />
                      </a>
                  </li>
              )}
              <li className="flex-full mr1 py1 pl1 mt1 bg-white" style={{ "minWidth": " 100px" }}>
                  <input
                      ref="input"
                      className="full h4 text-bold text-default no-focus borderless"
                      placeholder={placeholder}
                      value={inputValue}
                      autoFocus={focused}
                      onKeyDown={this.onInputKeyDown}
                      onChange={this.onInputChange}
                      onFocus={this.onInputFocus}
                      onBlur={this.onInputBlur}
                  />
              </li>
          </ul>

        const optionsList = filteredOptions.length === 0 ? null :
            <ul className="py1">
                {filteredOptions.map(option =>
                    <li
                        className={cx(
                            "py1 px2 flex align-center text-bold bg-brand-hover text-white-hover", {
                            "bg-grey-1": this._valueIsEqual(selectedOptionValue, option[valueKey])
                        })}
                        onClick={() => this.addOption(option)}
                    >
                      {optionRenderer(option)}
                    </li>
                )}
            </ul>

        return layoutRenderer({ valuesList, optionsList, focused, onClose: this.onClose })
    }
}

const DefaultTokenFieldLayout = ({ valuesList, optionsList, focused, onClose }) =>
  <OnClickOutsideWrapper handleDismissal={onClose}>
    <div>
      {valuesList}
      <Popover
          isOpen={focused && !!optionsList}
          hasArrow={false}
          tetherOptions={{
              attachment: "top left",
              targetAttachment: "bottom left",
              targetOffset: "10 0"
          }}
      >
        {optionsList}
      </Popover>
    </div>
  </OnClickOutsideWrapper>

DefaultTokenFieldLayout.propTypes = {
  valuesList: PropTypes.element.isRequired,
  optionsList: PropTypes.element,
  focused: PropTypes.bool,
  onClose: PropTypes.func,
}
