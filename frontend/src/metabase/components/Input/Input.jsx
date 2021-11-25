import React, { forwardRef } from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon";
import { InputField, InputInfoButtonRoot, InputRoot } from "./Input.styled";
import Tooltip from "metabase/components/Tooltip";

const propTypes = {
  tooltip: PropTypes.node,
  error: PropTypes.bool,
  fullWidth: PropTypes.bool,
};

const Input = ({ tooltip, error, fullWidth, ...rest }) => {
  return (
    <InputRoot fullWidth={fullWidth}>
      <InputField
        {...rest}
        hasError={error}
        hasTooltip={tooltip}
        fullWidth={fullWidth}
      />
      {tooltip && (
        <Tooltip tooltip={tooltip} placement="right" offset={[0, 20]}>
          <InputInfoButton />
        </Tooltip>
      )}
    </InputRoot>
  );
};

const InputInfoButton = forwardRef(function InputHelpButton(props, ref) {
  return (
    <InputInfoButtonRoot innerRef={ref}>
      <Icon name="info" />
    </InputInfoButtonRoot>
  );
});

Input.propTypes = propTypes;

export default Input;
