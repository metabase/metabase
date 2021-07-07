import React, { useCallback } from "react";
import PropTypes from "prop-types";
import styled from "styled-components";

import CheckBox, {
  DEFAULT_CHECKED_COLOR,
  DEFAULT_UNCHECKED_COLOR,
  DEFAULT_SIZE,
} from "metabase/components/CheckBox";
import { color } from "metabase/lib/colors";

const propTypes = {
  label: PropTypes.node,
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
  const renderLabel = useCallback(() => {
    if (label == null) {
      return null;
    }
    return <Label>{label}</Label>;
  }, [label]);

  return (
    <StackedCheckBoxRoot className={className}>
      <OpaqueCheckBox
        label={renderLabel()}
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
  top: -3px;
  left: 3px;

  background: ${props =>
    props.checked ? color(props.checkedColor) : color("bg-white")};

  border: 2px solid
    ${props =>
      props.checked ? color(props.checkedColor) : color(props.uncheckedColor)};
`;

const Label = styled(CheckBox.Label)`
  margin-top: -2px;
`;

StackedCheckBox.propTypes = propTypes;
StackedCheckBox.Label = Label;

export default StackedCheckBox;
