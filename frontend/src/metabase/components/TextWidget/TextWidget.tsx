import { Component } from "react";
import ReactDOM from "react-dom";
import { t } from "ttag";

import { forceRedraw } from "metabase/lib/dom";

type Props = {
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

export class TextWidget extends Component<Props, State> {
  static defaultProps = {
    isEditing: false,
    commitImmediately: false,
    disabled: false,
  };

  constructor(props: Props) {
    super(props);

    this.state = {
      value: props.value,
      isFocused: false,
    };
  }

  UNSAFE_componentWillMount() {
    this.UNSAFE_componentWillReceiveProps(this.props);
  }

  UNSAFE_componentWillReceiveProps(nextProps: Props) {
    if (nextProps.value !== this.props.value) {
      this.setState({ value: nextProps.value }, () => {
        // HACK: Address Safari rendering bug which causes https://github.com/metabase/metabase/issues/5335
        forceRedraw(ReactDOM.findDOMNode(this));
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

    return (
      <input
        className={className}
        type="text"
        value={value ?? ""}
        onChange={e => {
          this.setState({ value: e.target.value });
          if (this.props.commitImmediately) {
            this.props.setValue(e.target.value ?? null);
          }
        }}
        onKeyUp={e => {
          const target = e.target as HTMLInputElement;
          if (e.key === "Escape") {
            target.blur();
          } else if (e.key === "Enter") {
            setValue(this.state.value ?? null);
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
      />
    );
  }
}
