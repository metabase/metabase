import React from "react";
import PropTypes from "prop-types";
import styled from "styled-components";

import CheckBox, {
  DEFAULT_CHECKED_COLOR,
  DEFAULT_UNCHECKED_COLOR,
  DEFAULT_SIZE,
} from "metabase/components/CheckBox";
import { color } from "metabase/lib/colors";

const propTypes = {
  label: PropTypes.string,
  checked: PropTypes.bool,
  disabled: PropTypes.bool,
  checkedColor: PropTypes.string,
  uncheckedColor: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
};

function StackedCheckBox({
  label,
  checked,
  disabled = false,
  checkedColor = DEFAULT_CHECKED_COLOR,
  uncheckedColor = DEFAULT_UNCHECKED_COLOR,
  size = DEFAULT_SIZE,
  className,
  ...props
}) {
  return (
    <StackedCheckBoxRoot className={className}>
      <CheckBox
        label={label}
        checked={checked}
        disabled={disabled}
        checkedColor={checkedColor}
        uncheckedColor={uncheckedColor}
        size={size}
        {...props}
      />
      <StackedBackground
        checked={checked}
        disabled={disabled}
        checkedColor={checkedColor}
        uncheckedColor={uncheckedColor}
        hasLabel={!!label}
        size={size}
      />
    </StackedCheckBoxRoot>
  );
}

const StackedCheckBoxRoot = styled.div`
  position: relative;
  transform: scale(1);
`;

const StackedBackground = styled.div`
  width: ${props => `${props.size}px`};
  height: ${props => `${props.size}px`};
  border-radius: 4px;
  position: absolute;
  display: inline-block;

  z-index: -1;
  top: ${props => (props.hasLabel ? 0 : "-3px")};
  left: 3px;

  background: ${props =>
    props.checked ? color(props.checkedColor) : color("bg-white")};

  border: 2px solid
    ${props =>
      props.checked ? color(props.checkedColor) : color(props.uncheckedColor)};

  opacity: ${props => (props.disabled ? 0.4 : 1)};
`;

StackedCheckBox.propTypes = propTypes;
StackedCheckBox.Label = CheckBox.Label;

export default StackedCheckBox;
