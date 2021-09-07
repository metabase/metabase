import React, { forwardRef } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import {
  TextInputRoot,
  ClearButton,
  IconWrapper,
  Input,
} from "./TextInput.styled";

TextInput.propTypes = {
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  value: PropTypes.string,
  type: PropTypes.string,
  autoFocus: PropTypes.bool,
  className: PropTypes.string,
  hasClearButton: PropTypes.bool,
  icon: PropTypes.node,
  padding: PropTypes.oneOf(["sm", "md"]),
  borderRadius: PropTypes.oneOf(["sm", "md"]),
  colorScheme: PropTypes.oneOf(["default", "admin"]),
};

function TextInput({
  value = "",
  className,
  placeholder = t`Find...`,
  onChange,
  hasClearButton = false,
  icon,
  type = "text",
  colorScheme = "default",
  autoFocus = false,
  padding = "md",
  borderRadius = "md",
  ...rest
}) {
  const handleClearClick = () => {
    onChange("");
  };

  const showClearButton = hasClearButton && value.length > 0;

  return (
    <TextInputRoot className={className}>
      {icon && <IconWrapper>{icon}</IconWrapper>}
      <Input
        colorScheme={colorScheme}
        autoFocus={autoFocus}
        hasClearButton={hasClearButton}
        hasIcon={!!icon}
        placeholder={placeholder}
        value={value}
        type={type}
        onChange={e => onChange(e.target.value)}
        padding={padding}
        borderRadius={borderRadius}
        {...rest}
      />

      {showClearButton && (
        <ClearButton onClick={handleClearClick}>
          <Icon name="close" size={12} />
        </ClearButton>
      )}
    </TextInputRoot>
  );
}

export default forwardRef(function TextInputWithForwardedRef(props, ref) {
  return <TextInput forwardedRef={ref} {...props} />;
});
