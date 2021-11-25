import React from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon";
import { InputField, InputHelpButton, InputRoot } from "./Input.styled";

const propTypes = {
  error: PropTypes.bool,
  fullWidth: PropTypes.bool,
  helpText: PropTypes.node,
};

const Input = ({ error, fullWidth, helpText, ...rest }) => {
  return (
    <InputRoot fullWidth={fullWidth}>
      <InputField {...rest} fullWidth={fullWidth} error={error} />
      {helpText && (
        <InputHelpButton>
          <Icon name="info" />
        </InputHelpButton>
      )}
    </InputRoot>
  );
};

Input.propTypes = propTypes;

export default Input;
