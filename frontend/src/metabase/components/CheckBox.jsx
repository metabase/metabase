import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";
import styled, { css } from "styled-components";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

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
    <CheckboxRoot className={className} disabled={disabled}>
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

const CheckboxRoot = styled.label`
  display: block;
  cursor: pointer;

  ${props =>
    props.disabled &&
    css`
      opacity: 0.4;
      pointer-events: none;
    `}
`;

const Container = styled.div`
  display: flex;
  align-items: center;
`;

const VisibleBox = styled.span`
  display: flex;
  align-items: center;
  justify-center: center;
  position: relative;
  width: ${props => `${props.size}px`};
  height: ${props => `${props.size}px`};

  background-color: ${props =>
    props.checked ? color(props.checkedColor) : color("bg-white")};

  border: 2px solid
    ${props =>
      props.checked ? color(props.checkedColor) : color(props.uncheckedColor)};

  border-radius: 4px;

  ${props =>
    props.isFocused &&
    !props.checked &&
    css`
      outline: 1px auto ${color(props.checkedColor)};
    `}
`;

const Input = styled.input.attrs({ type: "checkbox" })`
  cursor: inherit;
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  margin: 0;
  padding: 0;
  z-index: 1;
`;

const CheckboxIcon = styled(Icon)`
  position: absolute;
  color: ${props =>
    props.checked ? color("white") : color(props.uncheckedColor)};
`;

const LabelText = styled.span`
  margin-left: 8px;
`;

Checkbox.propTypes = propTypes;
Checkbox.Label = LabelText;

export default Checkbox;
