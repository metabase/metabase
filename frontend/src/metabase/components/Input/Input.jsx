import React, { forwardRef } from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon";
import { InputField, InputHelpButton, InputRoot } from "./Input.styled";
import Tooltip from "metabase/components/Tooltip";

const propTypes = {
  error: PropTypes.bool,
  fullWidth: PropTypes.bool,
  helperText: PropTypes.node,
};

const Input = ({ error, fullWidth, helperText, ...rest }) => {
  return (
    <InputRoot fullWidth={fullWidth}>
      <InputField
        {...rest}
        hasError={error}
        hasTooltip={helperText}
        fullWidth={fullWidth}
      />
      {helperText && (
        <Tooltip tooltip={helperText} placement="right" offset={[0, 24]}>
          <InputHelpContent />
        </Tooltip>
      )}
    </InputRoot>
  );
};

const InputHelpContent = forwardRef(function InputHelpContent(props, ref) {
  return (
    <InputHelpButton innerRef={ref}>
      <Icon name="info" />
    </InputHelpButton>
  );
});

Input.propTypes = propTypes;

export default Input;
