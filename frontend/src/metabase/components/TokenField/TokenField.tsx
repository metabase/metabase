import { Component } from "react";
import * as React from "react";
import PropTypes from "prop-types";
import { findDOMNode } from "react-dom";
import _ from "underscore";
import cx from "classnames";

import { Icon } from "metabase/core/components/Icon";
import TippyPopover from "metabase/components/Popover/TippyPopover";

import {
  KEYCODE_ESCAPE,
  KEYCODE_ENTER,
  KEYCODE_TAB,
  KEYCODE_UP,
  KEYCODE_DOWN,
  KEYCODE_BACKSPACE,
  KEY_COMMA,
} from "metabase/lib/keyboard";
import { isObscured } from "metabase/lib/dom";
import { TokenFieldAddon, TokenFieldItem } from "../TokenFieldItem";

import {
  TokenInputItem,
  TokenFieldContainer,
  PrefixContainer,
} from "./TokenField.styled";

export type LayoutRendererArgs = {
  valuesList: React.ReactNode;
  optionsList: React.ReactNode;
  isFocused: boolean;
  isAllSelected: boolean;
  isFiltered: boolean;
  onClose: () => void;
};

export type TokenFieldProps = {
  value: any[];
  onChange: (value: any[]) => void;
  options: any[];
  placeholder?: string | undefined;
  multi?: boolean;
  validateValue?: (value: any) => boolean;
  parseFreeformValue?: (value: any) => any;
  updateOnInputChange?: boolean;
  optionRenderer?: (option: any) => React.ReactNode;
  valueRenderer?: (value: any) => React.ReactNode;
  layoutRenderer?: (args: LayoutRendererArgs) => React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
  className?: string;
  valueStyle?: React.CSSProperties;
  optionsStyle?: React.CSSProperties;
  optionsClassName?: string;
  prefix?: string;
  canAddItems?: boolean;
  autoFocus?: boolean;
  removeSelected?: boolean;
  idKey?: string | ((option: any) => string);
  valueKey?: string | ((option: any) => string);
  labelKey?: string | ((option: any) => string);
  onFocus?: () => void;
  onBlur?: () => void;
  onInputKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onInputChange?: (value: string) => string | void;
  updateOnInputBlur?: boolean;
  filterOption?: (options: any[], filter: string) => boolean;
};

type TokenFieldState = {
  inputValue: string;
  searchValue: string;
  filteredOptions: any[];
  selectedOptionValue: any;
  isFocused: boolean;
  isAllSelected: boolean;
  listIsHovered: boolean;
};

const defaultStyleValue = {
  fontSize: 14,
  fontWeight: 700,
};

class TokenField extends Component<TokenFieldProps, TokenFieldState> {
  inputRef: React.RefObject<HTMLInputElement>;
  scrollElement = null;

  constructor(props: TokenFieldProps) {
    super(props);

    this.state = {
      inputValue: "",
      searchValue: "",
      filteredOptions: [],
      selectedOptionValue: null,
      isFocused: props.autoFocus || false,
      isAllSelected: false,
      listIsHovered: false,
    };

    this.inputRef = React.createRef();
  }

  static propTypes = {
    value: PropTypes.array.isRequired,
    onChange: PropTypes.func.isRequired,
    options: PropTypes.array,
    placeholder: PropTypes.string,
    multi: PropTypes.bool,
    validateValue: PropTypes.func,
    parseFreeformValue: PropTypes.func,
    updateOnInputChange: PropTypes.bool,
    optionRenderer: PropTypes.func,
    valueRenderer: PropTypes.func,
    layoutRenderer: PropTypes.func,
    color: PropTypes.string,
    style: PropTypes.object,
    className: PropTypes.string,
    valueStyle: PropTypes.object,
    optionsStyle: PropTypes.object,
    optionsClassName: PropTypes.string,
    prefix: PropTypes.string,
    canAddItems: PropTypes.bool,
    autoFocus: PropTypes.bool,
    removeSelected: PropTypes.bool,
    idKey: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
    valueKey: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
    labelKey: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
    onFocus: PropTypes.func,
    onBlur: PropTypes.func,
    onInputKeyDown: PropTypes.func,
    onInputChange: PropTypes.func,
    updateOnInputBlur: PropTypes.bool,
    filterOption: PropTypes.func,
  };

  UNSAFE_componentWillMount() {
    this._updateFilteredValues(this.props);
  }

  UNSAFE_componentWillReceiveProps(nextProps: TokenFieldProps) {
    this._updateFilteredValues(nextProps);
  }

  setInputValue(inputValue: any, setSearchValue = true) {
    const newState = {
      inputValue,
      searchValue: setSearchValue ? inputValue : this.state.searchValue,
    };
    this.setState(newState, () => this._updateFilteredValues(this.props));
  }

  clearInputValue(clearSearchValue = true) {
    this.setInputValue("", clearSearchValue);
  }

  _id(value: any) {
    const { idKey } = this.props;

    if (typeof idKey === "function") {
      return idKey(value);
    } else if (typeof idKey === "string") {
      return value[idKey];
    } else {
      return value;
    }
  }

  _value(option: any) {
    const { valueKey = "value" } = this.props;
    if (typeof valueKey === "function") {
      return valueKey(option);
    } else {
      return option[valueKey];
    }
  }

  _label(option: any) {
    const { labelKey = "label" } = this.props;
    if (typeof labelKey === "function") {
      return labelKey(option);
    } else {
      return option[labelKey];
    }
  }

  _key(option: any) {
    return JSON.stringify(this._value(option));
  }

  _isLastFreeformValue(inputValue: any) {
    const { value, parseFreeformValue, updateOnInputChange } = this.props;
    if (parseFreeformValue && updateOnInputChange) {
      const freeformValue = parseFreeformValue(inputValue);
      const currentLastValue = value[value.length - 1];
      // check to see if the current last value is the same as the inputValue, in which case we should replace it or remove it
      return currentLastValue === freeformValue;
    }
  }

  _updateFilteredValues = (props: TokenFieldProps) => {
    const { options = [], value, removeSelected = true } = props;
    let { searchValue, selectedOptionValue } = this.state;
    const selectedValueIds = new Set(
      value.map(v => JSON.stringify(this._id(v))),
    );

    const filterOption =
      props.filterOption ||
      ((option, searchValue) =>
        String(this._label(option) || "").indexOf(searchValue) >= 0);

    let selectedCount = 0;
    const filteredOptions = options.filter(option => {
      const isSelected = selectedValueIds.has(
        JSON.stringify(this._id(this._value(option))),
      );
      const isLastFreeform =
        this._isLastFreeformValue(this._value(option)) &&
        this._isLastFreeformValue(searchValue);
      const isMatching = filterOption(option, searchValue);
      if (isSelected) {
        selectedCount++;
      }
      // filter out options who have already been selected, unless:
      return (
        // remove selected is disabled
        (!removeSelected ||
          // or it's not in the selectedValues
          !isSelected ||
          // or it's the current "freeform" value, which updates as we type
          isLastFreeform) &&
        // and it's matching
        isMatching
      );
    });

    if (
      selectedOptionValue == null ||
      !_.find(filteredOptions, option =>
        this._valueIsEqual(selectedOptionValue, this._value(option)),
      )
    ) {
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
      selectedOptionValue,
      isAllSelected: options.length > 0 && selectedCount === options.length,
    });
  };

  onInputChange = ({
    target: { value },
  }: React.ChangeEvent<HTMLInputElement>) => {
    const { updateOnInputChange, onInputChange, parseFreeformValue } =
      this.props;

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
  };

  // capture events on the input to allow for convenient keyboard shortcuts
  onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (this.props.onInputKeyDown) {
      this.props.onInputKeyDown(event);
    }

    const { key, keyCode } = event;

    const { filteredOptions, selectedOptionValue } = this.state;

    // enter, tab, comma
    if (
      keyCode === KEYCODE_ESCAPE ||
      keyCode === KEYCODE_TAB ||
      // We check event.key for comma presses because some keyboard layouts
      // (e.g. Russian) have a letter on that key and require a modifier to type
      // ",". Similarly, if you want to type "<" on the US keyboard layout, you
      // need to look at `key` to distinguish it from ",".
      key === KEY_COMMA ||
      keyCode === KEYCODE_ENTER
    ) {
      if (this.addSelectedOption(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    } else if (event.keyCode === KEYCODE_UP) {
      // up arrow
      event.preventDefault();
      const index = _.findIndex(filteredOptions, option =>
        this._valueIsEqual(selectedOptionValue, this._value(option)),
      );
      if (index > 0) {
        this.setState({
          selectedOptionValue: this._value(filteredOptions[index - 1]),
        });
      }
    } else if (keyCode === KEYCODE_DOWN) {
      // down arrow
      event.preventDefault();
      const index = _.findIndex(filteredOptions, option =>
        this._valueIsEqual(selectedOptionValue, this._value(option)),
      );
      if (index >= 0 && index < filteredOptions.length - 1) {
        this.setState({
          selectedOptionValue: this._value(filteredOptions[index + 1]),
        });
      }
    } else if (keyCode === KEYCODE_BACKSPACE) {
      // backspace
      const { value } = this.props;
      if (!this.state.inputValue && value.length > 0) {
        this.removeValue(value[value.length - 1]);
      }
    }
  };

  onInputFocus = () => {
    if (this.props.onFocus) {
      this.props.onFocus();
    }
    this.setState({ isFocused: true, searchValue: this.state.inputValue }, () =>
      this._updateFilteredValues(this.props),
    );
  };

  onInputBlur = () => {
    if (this.props.updateOnInputBlur && this.props.parseFreeformValue) {
      const input = this.inputRef.current;
      const value = this.props.parseFreeformValue(input?.value);
      if (
        value != null &&
        (this.props.multi || value !== this.props.value[0])
      ) {
        this.addValue(value);
        this.clearInputValue();
      }
    }
    if (this.props.onBlur) {
      this.props.onBlur();
    }
    this.setState({ isFocused: false });
  };

  onInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (this.props.parseFreeformValue) {
      e.preventDefault();
      const string = e.clipboardData.getData("Text");
      const lines = this.props.multi ? string.split(/\n|,/g) : [string];
      const values = lines.map(this.props.parseFreeformValue).filter(s => s);
      if (values.length > 0) {
        this.addValue(values);
      }
    }
  };

  onMouseDownCapture = (e: React.MouseEvent<HTMLElement>) => {
    const input = this.inputRef.current;
    input?.focus();
    // prevents clicks from blurring input while still allowing text selection:
    if (input !== e.target) {
      e.preventDefault();
    }
  };

  onClose = () => {
    this.setState({ isFocused: false });
  };

  addSelectedOption(e: React.KeyboardEvent<HTMLInputElement>) {
    const { multi } = this.props;
    const { filteredOptions, selectedOptionValue } = this.state;
    const input = this.inputRef.current;
    const option = _.find(filteredOptions, option =>
      this._valueIsEqual(selectedOptionValue, this._value(option)),
    );
    if (option) {
      this.addOption(option);
      // clear the input if the option is the same as the last value
      if (this._isLastFreeformValue(this._value(option))) {
        // also clear the search
        this.clearInputValue(true);
      } else {
        // only clear the search if this was the last option
        this.clearInputValue(filteredOptions.length === 1);
      }
      return true;
    } else if (this.props.parseFreeformValue) {
      // if we previously updated on input change then we don't need to do it again,
      if (this.props.updateOnInputChange) {
        // if multi=true also prevent the input from changing due to this key press
        const value = this.props.parseFreeformValue(input?.value);
        if (multi && value !== null) {
          e.preventDefault();
        }
        // and clear the input
        this.clearInputValue();
        // return false so we don't stop the keyDown from propagating in case we're listening
        // for it, e.x. in the filter popover this allows enter to commit the filter
        return false;
      } else {
        const value = this.props.parseFreeformValue(input?.value);
        if (value != null && (multi || value !== this.props.value[0])) {
          this.addValue(value);
          this.clearInputValue();
          return true;
        }
      }
    }
  }

  addOption = (option: any) => {
    const replaceLast = this._isLastFreeformValue(this.state.inputValue);
    // add the option's value to the current value
    this.addValue(this._value(option), replaceLast);
  };

  addValue(valueToAdd: any, replaceLast = false) {
    const { value, onChange, multi } = this.props;
    if (!Array.isArray(valueToAdd)) {
      valueToAdd = [valueToAdd];
    }
    if (multi) {
      if (replaceLast) {
        onChange(_.unique(value.slice(0, -1).concat(valueToAdd)));
      } else {
        onChange(_.unique(value.concat(valueToAdd)));
      }
    } else {
      onChange(valueToAdd.slice(0, 1));
    }
  }

  removeValue(valueToRemove: any) {
    const { value, onChange } = this.props;
    const values = value.filter(v => !this._valueIsEqual(v, valueToRemove));
    onChange(values);
  }

  _valueIsEqual(v1: any, v2: any) {
    return JSON.stringify(v1) === JSON.stringify(v2);
  }

  componentDidUpdate(prevProps: TokenFieldProps, prevState: TokenFieldState) {
    const input = this.inputRef.current;

    if (
      prevState.selectedOptionValue !== this.state.selectedOptionValue &&
      this.scrollElement != null
    ) {
      const element = findDOMNode(this.scrollElement);
      if (element && isObscured(element) && element instanceof Element) {
        element.scrollIntoView({ block: "nearest" });
      }
    }

    // if we added a value then scroll to the last item (the input)
    if (this.props.value.length > prevProps.value.length) {
      if (input && isObscured(input)) {
        input.scrollIntoView({ block: "nearest" });
      }
    }

    // We focus on the input here, and not on the input itself as a prop
    // (say by passing prop autoFocus={isFocused})
    // because certain TokenFields will live in position: fixed containers.
    // Autofocusing like that would make the page jump in scroll position.
    // One example: parameter filters in dashboard pages.
    if (this.state.isFocused) {
      input?.focus({ preventScroll: true });
    }
  }

  render() {
    let {
      value,
      placeholder,
      multi,

      validateValue = () => true,
      parseFreeformValue,
      updateOnInputChange,

      optionRenderer = (option: any) => <span>{option}</span>,
      valueRenderer = (value: any) => <span>{value}</span>,
      layoutRenderer = (props: LayoutRendererArgs) => (
        <DefaultTokenFieldLayout {...props} />
      ),

      color = "brand",

      style = {},
      className,
      valueStyle = {},
      optionsStyle = {},
      optionsClassName,
      prefix,

      canAddItems = true,
    } = this.props;
    let {
      inputValue,
      searchValue,
      filteredOptions,
      isFocused,
      isAllSelected,
      selectedOptionValue,
    } = this.state;

    // for non-multi fields, keep the value in the input
    if (!multi) {
      inputValue = inputValue || value[0];
      value = [];
    }

    // if we have a value and updateOnInputChange is enabled, and the last value matches the inputValue
    if (
      value.length > 0 &&
      updateOnInputChange &&
      parseFreeformValue &&
      value[value.length - 1] === parseFreeformValue(inputValue) &&
      multi
    ) {
      if (isFocused) {
        // if focused, don't render the last value
        value = value.slice(0, -1);
      } else {
        // if not focused, don't render the inputValue
        inputValue = "";
      }
    }

    // if not focused we won't get key events to accept the selected value, so don't render as selected
    if (!isFocused) {
      selectedOptionValue = null;
    }

    // don't show the placeholder if we already have a value
    if (value.length > 0) {
      placeholder = undefined;
    }

    const isControlledInput = !!this.onInputChange;
    const valuesList = (
      <TokenFieldContainer
        style={style}
        className={cx(className, {
          "TokenField--focused": isFocused,
        })}
        onMouseDownCapture={this.onMouseDownCapture}
      >
        {!!prefix && (
          <PrefixContainer data-testid="input-prefix">{prefix}</PrefixContainer>
        )}
        {value.map((v, index) => (
          <TokenFieldItem key={index} isValid={validateValue(v)}>
            <span style={{ ...defaultStyleValue, ...valueStyle }}>
              {valueRenderer(v)}
            </span>
            {multi && (
              <TokenFieldAddon
                isValid={validateValue(v)}
                onClick={e => {
                  e.preventDefault();
                  this.removeValue(v);
                  this.inputRef?.current?.blur();
                }}
                onMouseDown={e => e.preventDefault()}
              >
                <Icon name="close" className="flex align-center" size={12} />
              </TokenFieldAddon>
            )}
          </TokenFieldItem>
        ))}
        {canAddItems && (
          <TokenInputItem>
            <input
              ref={this.inputRef}
              style={{ ...defaultStyleValue, ...valueStyle }}
              className={cx("full no-focus borderless px1")}
              // set size to be small enough that it fits in a parameter.
              size={10}
              placeholder={placeholder}
              value={isControlledInput ? inputValue : undefined}
              defaultValue={isControlledInput ? undefined : inputValue}
              onKeyDown={this.onInputKeyDown}
              onChange={isControlledInput ? this.onInputChange : undefined}
              onFocus={this.onInputFocus}
              onBlur={this.onInputBlur}
              onPaste={this.onInputPaste}
            />
          </TokenInputItem>
        )}
      </TokenFieldContainer>
    );

    const optionsList =
      filteredOptions.length === 0 ? null : (
        <ul
          className={cx(optionsClassName, "overflow-auto pl1 my1 scroll-hide")}
          style={{ maxHeight: 300, ...optionsStyle }}
          onMouseEnter={() => this.setState({ listIsHovered: true })}
          onMouseLeave={() => this.setState({ listIsHovered: false })}
        >
          {filteredOptions.map(option => (
            <li className="mr1" key={this._key(option)}>
              <div
                className={cx(
                  `py1 pl1 pr2 block rounded text-bold text-${color}-hover inline-block full cursor-pointer`,
                  `bg-light-hover`,
                  {
                    [`text-${color} bg-light`]:
                      !this.state.listIsHovered &&
                      this._valueIsEqual(
                        selectedOptionValue,
                        this._value(option),
                      ),
                  },
                )}
                onClick={e => {
                  this.addOption(option);
                  // clear the input value, and search value if last option
                  this.clearInputValue(filteredOptions.length === 1);
                  e.preventDefault();
                }}
                onMouseDown={e => e.preventDefault()}
              >
                {optionRenderer(option)}
              </div>
            </li>
          ))}
        </ul>
      );

    return layoutRenderer({
      valuesList,
      optionsList,
      isFocused,
      isAllSelected,
      isFiltered: !!searchValue,
      onClose: this.onClose,
    });
  }
}

type DefaultTokenFieldLayoutProps = {
  valuesList: React.ReactNode;
  optionsList?: React.ReactNode;
  isFocused?: boolean;
};

const DefaultTokenFieldLayout = ({
  valuesList,
  optionsList,
  isFocused,
}: DefaultTokenFieldLayoutProps) => (
  <div>
    <TippyPopover
      visible={isFocused && !!optionsList}
      content={<div>{optionsList}</div>}
      placement="bottom-start"
    >
      <div>{valuesList}</div>
    </TippyPopover>
  </div>
);

DefaultTokenFieldLayout.propTypes = {
  valuesList: PropTypes.element.isRequired,
  optionsList: PropTypes.element,
  isFocused: PropTypes.bool,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(TokenField, {
  FieldItem: TokenFieldItem,
  NewItemInputContainer: TokenInputItem,
});
