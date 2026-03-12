import { Component, createRef } from "react";
import { t } from "ttag";

import { forceRedraw } from "metabase/lib/dom";

export type TextWidgetProps = {
  value: string | number;
  setValue: (v: string | number | null) => void;
  className?: string;
  isEditing: boolean;
  commitImmediately?: boolean;
  placeholder?: string;
  focusChanged: (f: boolean) => void;
  disabled?: boolean;
};

type State = {
  value: string | number | null;
  isFocused: boolean;
};

const MIN_SIZE = 8;

export class TextWidget extends Component<TextWidgetProps, State> {
  static defaultProps = {
    isEditing: false,
    commitImmediately: false,
    disabled: false,
  };

  inputRef = createRef<HTMLInputElement>();

  constructor(props: TextWidgetProps) {
    super(props);

    this.state = {
      value: props.value,
      isFocused: false,
    };
  }

  UNSAFE_componentWillMount() {
    this.UNSAFE_componentWillReceiveProps(this.props);
  }

  UNSAFE_componentWillReceiveProps(nextProps: TextWidgetProps) {
    if (nextProps.value !== this.props.value) {
      this.setState({ value: nextProps.value }, () => {
        if (this.inputRef.current) {
          // HACK: Address Safari rendering bug which causes https://github.com/metabase/metabase/issues/5335
          forceRedraw(this.inputRef.current);
        }
      });
    }
  }

  render() {
    const { setValue, className, isEditing, focusChanged, disabled } =
      this.props;
    const defaultPlaceholder = this.state.isFocused
      ? ""
      : this.props.placeholder || t`Enter a value...`;

    const changeFocus = (isFocused: boolean) => {
      if (focusChanged) {
        focusChanged(isFocused);
      }
      this.setState({ isFocused });
    };

    const value = Array.isArray(this.state.value)
      ? this.state.value[0]
      : this.state.value;

    const displayValue = String(value ?? "");

    return (
      <input
        className={className}
        type="text"
        value={displayValue}
        style={{
          maxWidth: "160px",
        }}
        onChange={(e) => {
          this.setState({ value: e.target.value });
          if (this.props.commitImmediately) {
            this.props.setValue(e.target.value ?? null);
          }
        }}
        onKeyUp={(e) => {
          if (e.nativeEvent.isComposing) {
            return;
          }
          const target = e.target as HTMLInputElement;
          if (e.key === "Enter") {
            target.blur();
          }
        }}
        onFocus={() => {
          changeFocus(true);
        }}
        onBlur={() => {
          changeFocus(false);
          if (this.state.value !== this.props.value) {
            setValue(this.state.value ?? null);
          }
        }}
        placeholder={isEditing ? t`Enter a default value…` : defaultPlaceholder}
        disabled={disabled}
        ref={this.inputRef}
        size={Math.max(
          displayValue.length || defaultPlaceholder.length,
          MIN_SIZE,
        )}
      />
    );
  }
}
