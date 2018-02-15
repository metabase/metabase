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
import { isObscured } from "metabase/lib/dom";

// somewhat matches react-select's API: https://github.com/JedWatson/react-select
export default class TokenField extends Component {
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
        multi: PropTypes.bool,

        style: PropTypes.object,
        color: PropTypes.string,

        valueKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.func]),
        labelKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.func]),

        removeSelected: PropTypes.bool,
        filterOption: PropTypes.func,

        onChange: PropTypes.func.isRequired,
        onInputChange: PropTypes.func,
        onInputKeyDown: PropTypes.func,
        updateOnInputChange: PropTypes.bool,
        // if provided, parseFreeformValue parses the input string into a value,
        // or returns null to indicate an invalid value
        parseFreeformValue: PropTypes.func,

        valueRenderer: PropTypes.func.isRequired, // TODO: default
        optionRenderer: PropTypes.func.isRequired, // TODO: default
        layoutRenderer: PropTypes.func,
    };

    static defaultProps = {
        removeSelected: true,
        layoutRenderer: (props) => <DefaultTokenFieldLayout {...props} />,
        valueKey: "value",
        labelKey: "label",

        valueRenderer: (value) => <span>{value}</span>,
        optionRenderer: (option) => <span>{option}</span>,

        color: "brand",
    };

    componentWillMount() {
      this._updateFilteredValues();
    }

    componentWillReceiveProps(nextProps, nextState) {
      setTimeout(this._updateFilteredValues, 0);
    }

    setInputValue(inputValue) {
        this.setState({
            inputValue
        }, this._updateFilteredValues);
    }

    filterOption(option, inputValue) {
      const { filterOption } = this.props;
      if (filterOption) {
        return filterOption(option, inputValue);
      } else {
        return String(this._label(option) || "").indexOf(inputValue) >= 0;
      }
    }

    _value(option) {
      const { valueKey } = this.props;
      return (typeof valueKey === "function") ? valueKey(option) : option[valueKey];
    }

    _label(option) {
      const { labelKey } = this.props;
      return (typeof labelKey === "function") ? labelKey(option) : option[labelKey];
    }

    _isLastFreeformValue(inputValue) {
      const { value, parseFreeformValue, updateOnInputChange } = this.props;
      if (parseFreeformValue && updateOnInputChange) {
        const freeformValue = parseFreeformValue(inputValue);
        const currentLastValue = value[value.length - 1];
        // check to see if the current last value is the same as the inputValue, in which case we should replace it or remove it
        return currentLastValue === freeformValue;
      }
    }

    _updateFilteredValues = () => {
      const { options, value, removeSelected } = this.props;
      let { inputValue, selectedOptionValue } = this.state;
      let selectedValues = new Set(value.map(v => JSON.stringify(v)));

      let filteredOptions = options.filter(option =>
          // filter out options who have already been selected, unless:
          (
            // remove selected is disabled
            !removeSelected
            // or it's not in the selectedValues
            || !selectedValues.has(JSON.stringify(this._value(option)))
            // or it's the current "freeform" value, which updates as we type
            || (
              this._isLastFreeformValue(this._value(option)) &&
              this._isLastFreeformValue(inputValue)
            )
          ) &&
          this.filterOption(option, inputValue)
      );

      if (selectedOptionValue == null || !_.find(filteredOptions, (option) => this._valueIsEqual(selectedOptionValue, this._value(option)))) {
          // if there are results based on the user's typing...
          if (filteredOptions.length > 0) {
              // select the first option in the list and set the selected option to that
              selectedOptionValue = this._value(filteredOptions[0]);
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
      const { updateOnInputChange, onInputChange, parseFreeformValue } = this.props;

      if (onInputChange) {
        value = onInputChange(value) || "";
      }

      // update the input value
      this.setInputValue(value);

      // if updateOnInputChange is true and parseFreeformValue is enabled then try adding/updating the freeform value immediately
      if (updateOnInputChange && parseFreeformValue) {
        const replaceLast = this._isLastFreeformValue(this.state.inputValue);
        // call parseFreeformValue to make sure we can add it
        const freeformValue = parseFreeformValue(value);
        if (freeformValue != null) {
          // if so, add it, replacing the last value if necessary
          this.addValue(freeformValue, replaceLast);
        } else {
          // otherwise remove the value if necessary, e.x. after deleting
          if (replaceLast) {
            this.removeValue(parseFreeformValue(this.state.inputValue));
          }
        }
      }
    }

    // capture events on the input to allow for convenient keyboard shortcuts
    onInputKeyDown = (event) => {
        if (this.props.onInputKeyDown) {
          this.props.onInputKeyDown(event);
        }

        const keyCode = event.keyCode;

        const { filteredOptions, selectedOptionValue } = this.state

        // enter, tab, comma
        if (keyCode === KEYCODE_ESCAPE || keyCode === KEYCODE_TAB || keyCode === KEYCODE_COMMA || keyCode === KEYCODE_ENTER) {
            if (this.addSelectedOption(event)) {
                event.stopPropagation();
            }
        }

        // up arrow
        else if (event.keyCode === KEYCODE_UP) {
            event.preventDefault();
            let index = _.findIndex(filteredOptions, (option) => this._valueIsEqual(selectedOptionValue, this._value(option)));
            if (index > 0) {
                this.setState({ selectedOptionValue: this._value(filteredOptions[index - 1]) });
            }
        }

        // down arrow
        else if (keyCode === KEYCODE_DOWN) {
            event.preventDefault();
            let index = _.findIndex(filteredOptions, (option) => this._valueIsEqual(selectedOptionValue, this._value(option)));
            if (index >= 0 && index < filteredOptions.length - 1) {
                this.setState({ selectedOptionValue: this._value(filteredOptions[index + 1]) });
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
        if (this.props.onFocus) {
            this.props.onFocus()
        }
        this.setState({ focused: true });
    }

    onInputBlur = () => {
        if (this.props.onBlur) {
            this.props.onBlur()
        }
        setTimeout(() => {
          this.setState({ focused: false });
        }, 100)
    }

    onInputPaste = (e) => {
      if (this.props.parseFreeformValue) {
        const string = e.clipboardData.getData('Text');
        const values = string.split(/\n|,/g).map(this.props.parseFreeformValue).filter(s => s);
        if (values.length > 0) {
          this.addValue(values);
        }
      }
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

    clearInputValue() {
      this.setInputValue("")
      // setTimeout(() => this.setInputValue(""), 0);
    }

    addSelectedOption(e) {
        const { multi } = this.props
        const { selectedOptionValue } = this.state;
        let input = findDOMNode(this.refs.input);
        let option = _.find(this.state.filteredOptions, (option) => this._valueIsEqual(selectedOptionValue, this._value(option)));
        if (option) {
            this.addOption(option);
            // clear the input if the option is the same as the last value
            if (this._isLastFreeformValue(this._value(option))) {
                this.clearInputValue();
            }
            return true;
        } else if (this.props.parseFreeformValue) {
            // if we previously updated on input change then we don't need to do it again,
            if (this.props.updateOnInputChange) {
              // if multi=true also prevent the input from changing due to this key press
              if (multi) {
                e.preventDefault();
              }
              // and clear the input
              this.clearInputValue()
              // return false so we don't stop the keyDown from propagating in case we're listening
              // for it, e.x. in the filter popover this allows enter to commit the filter
              return false;
            } else {
              const value = this.props.parseFreeformValue(input.value);
              if (value != null && (multi || value !== this.props.value[0])) {
                  this.addValue(value);
                  this.clearInputValue()
                  return true;
              }
            }
        }
    }

    addOption = (option) => {
        const replaceLast = this._isLastFreeformValue(this.state.inputValue);
        // add the option's value to the current value
        this.addValue(this._value(option), replaceLast);
    }

    addValue(valueToAdd, replaceLast = false) {
        const { value, onChange, multi } = this.props;
        if (!Array.isArray(valueToAdd)) {
          valueToAdd = [valueToAdd]
        }
        if (multi) {
            if (replaceLast) {
                onChange(dedup(value.slice(0, -1).concat(valueToAdd)));
            } else {
                onChange(dedup(value.concat(valueToAdd)));
            }
        } else {
            onChange(valueToAdd.slice(0,1));
        }
        // reset the input value
        // setTimeout(() =>
        //   this.setInputValue("")
        // )
    }

    removeValue(valueToRemove) {
        const { value, onChange } = this.props
        const values = value.filter(v => !this._valueIsEqual(v, valueToRemove));
        onChange(values);
        // reset the input value
        // this.setInputValue("");
    }

    _valueIsEqual(v1, v2) {
      return JSON.stringify(v1) === JSON.stringify(v2);
    }

    componentDidUpdate(prevProps, prevState) {
      if (prevState.selectedOptionValue !== this.state.selectedOptionValue && this.scrollElement) {
        const element = findDOMNode(this.scrollElement);
        if (element && isObscured(element)) {
          element.scrollIntoView(element)
        }
      }
    }

    render() {
        let { value, placeholder, multi, optionRenderer, valueRenderer, layoutRenderer, color, parseFreeformValue, updateOnInputChange } = this.props;
        let { inputValue, filteredOptions, focused, selectedOptionValue } = this.state;

        if (!multi && focused) {
            inputValue = inputValue || value[0];
            value = [];
        }

        // if we have a value and updateOnInputChange is enabled, and the last value matches the inputValue
        if (value.length > 0 && updateOnInputChange && parseFreeformValue && value[value.length - 1] === parseFreeformValue(inputValue)) {
            if (focused) {
              // if focused, don't render the last value
              value = value.slice(0, -1);
            } else {
              // if not focused, don't render the inputValue
              inputValue = "";
            }
        }

        // if not focused we won't get key events to accept the selected value, so don't render as selected
        if (!focused) {
          selectedOptionValue = null;
        }

        // don't show the placeholder if we already have a value
        if (value.length > 0) {
            placeholder = null;
        }

        const valuesList =
          <ul
              className={cx("m1 px1 pb1 bordered rounded flex flex-wrap bg-white", {
                [`input--focus border-${color}`]: this.state.focused
              })}
              style={this.props.style}
              onMouseDownCapture={this.onMouseDownCapture}
          >
              {value.map((v, index) =>
                  <li key={v} className={`mr1 py1 pl1 mt1 rounded bg-${color} text-white`}>
                      <span className="h4 text-bold">
                        {valueRenderer(v)}
                      </span>
                      <a
                          className="text-grey-2 text-white-hover px1"
                          onClick={(e) => {
                            this.removeValue(v);
                            e.preventDefault();
                          }}
                      >
                          <Icon name="close" className="" size={12} />
                      </a>
                  </li>
              )}
              <li className="flex-full mr1 py1 pl1 mt1 bg-white">
                  <input
                      ref="input"
                      className="full h4 text-bold text-default no-focus borderless"
                      // set size to be small enough that it fits in a parameter.
                      size={10}
                      placeholder={placeholder}
                      value={inputValue}
                      autoFocus={focused}
                      onKeyDown={this.onInputKeyDown}
                      onChange={this.onInputChange}
                      onFocus={this.onInputFocus}
                      onBlur={this.onInputBlur}
                      onPaste={this.onInputPaste}
                  />
              </li>
          </ul>

        const optionsList = filteredOptions.length === 0 ? null :
            <ul
              className="ml1 scroll-y scroll-show"
              style={{ maxHeight: 300 }}
              onMouseEnter={() => this.setState({ listIsHovered: true })}
              onMouseLeave={() => this.setState({ listIsHovered: false })}
            >
                {filteredOptions.map(option =>
                    <li key={this._value(option)}>
                      <div
                        ref={this._valueIsEqual(selectedOptionValue, this._value(option)) ? (_ => this.scrollElement = _) : null}
                        className={cx(
                          `py1 pl1 pr2 block rounded text-bold inline-block cursor-pointer`,
                          `text-white-hover bg-${color}-hover`, {
                            [`text-white bg-${color}`]: !this.state.listIsHovered && this._valueIsEqual(selectedOptionValue, this._value(option))
                          }
                        )}
                        onClick={(e) => {
                          this.addOption(option);
                          e.preventDefault();
                        }}
                      >
                        {optionRenderer(option)}
                      </div>
                    </li>
                )}
            </ul>

        return layoutRenderer({ valuesList, optionsList, focused, onClose: this.onClose })
    }
}

const dedup = (array) => Array.from(new Set(array));

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
