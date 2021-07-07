import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";
import {
  CheckboxRoot,
  Container,
  VisibleBox,
  Input,
  CheckboxIcon,
  LabelText,
} from "./CheckBox.styled";

const propTypes = {
  checked: PropTypes.bool,
  indeterminate: PropTypes.bool,
  label: PropTypes.node,
  disabled: PropTypes.bool,
  onChange: PropTypes.func,
  onFocus: PropTypes.func,
  onBlur: PropTypes.func,

  // Expect color aliases, literals
  // Example: brand, accent1, success
  // Won't work: red, #000, rgb(0, 0, 0)
  checkedColor: PropTypes.string,
  uncheckedColor: PropTypes.string,

  size: PropTypes.number,
  autoFocus: PropTypes.bool,

  className: PropTypes.string,
};

export const DEFAULT_CHECKED_COLOR = "brand";
export const DEFAULT_UNCHECKED_COLOR = "text-light";
export const DEFAULT_SIZE = 16;

const ICON_PADDING = 4;

function Checkbox({
  label,
  checked,
  indeterminate,
  disabled = false,
  onChange,
  onFocus,
  onBlur,
  checkedColor = DEFAULT_CHECKED_COLOR,
  uncheckedColor = DEFAULT_UNCHECKED_COLOR,
  size = DEFAULT_SIZE,
  autoFocus = false,
  className,
  ...props
}) {
  const [isFocused, setFocused] = useState(autoFocus);

  const handleFocus = useCallback(
    e => {
      setFocused(true);
      if (typeof onFocus === "function") {
        onFocus(e);
      }
    },
    [onFocus],
  );

  const handleBlur = useCallback(
    e => {
      setFocused(false);
      if (typeof onBlur === "function") {
        onBlur(e);
      }
    },
    [onBlur],
  );

  const onKeyPress = useCallback(
    e => {
      if (e.key === "Enter" && typeof onChange === "function") {
        onChange({
          preventDefault: () => e.preventDefault(),
          target: { checked: !checked },
        });
      }
    },
    [checked, onChange],
  );

  const renderLabel = useCallback(() => {
    if (label == null) {
      return null;
    }
    return React.isValidElement(label) ? label : <LabelText>{label}</LabelText>;
  }, [label]);

  return (
    <CheckboxRoot
      className={className}
      disabled={disabled}
      data-testid="checkbox-root"
    >
      <Container>
        <VisibleBox
          checked={checked}
          isFocused={isFocused}
          size={size}
          checkedColor={checkedColor}
          uncheckedColor={uncheckedColor}
        >
          <Input
            {...props}
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyPress={onKeyPress}
          />
          {(checked || indeterminate) && (
            <CheckboxIcon
              checked={checked}
              name={indeterminate ? "dash" : "check"}
              size={size - ICON_PADDING}
              uncheckedColor={uncheckedColor}
            />
          )}
        </VisibleBox>
        {renderLabel()}
      </Container>
    </CheckboxRoot>
  );
}

Checkbox.propTypes = propTypes;
Checkbox.Label = LabelText;

export default Checkbox;
