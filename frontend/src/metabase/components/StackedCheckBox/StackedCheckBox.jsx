import { useCallback } from "react";
import PropTypes from "prop-types";

import {
  DEFAULT_CHECKED_COLOR,
  DEFAULT_UNCHECKED_COLOR,
  DEFAULT_SIZE,
} from "metabase/components/CheckBox";

import {
  StackedCheckBoxRoot,
  OpaqueCheckBox,
  StackedBackground,
  Label,
} from "./StackedCheckBox.styled";

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
    <StackedCheckBoxRoot className={className} disabled={disabled}>
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

StackedCheckBox.propTypes = propTypes;
StackedCheckBox.Label = Label;

export default StackedCheckBox;
