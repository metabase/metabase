import React, { forwardRef } from "react";
import PropTypes from "prop-types";
import styled, { css } from "styled-components";
import { color } from "metabase/lib/colors";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

function TextInput({
  value,
  className,
  placeholder,
  onChange,
  hasClearButton,
  icon,
  type,
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
        hasClearButton
        hasIcon={!!icon}
        placeholder={placeholder}
        value={value}
        type={type}
        onChange={e => onChange(e.target.value)}
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
};

TextInput.defaultProps = {
  placeholder: t`Find...`,
  value: "",
  type: "text",
  autoFocus: false,
  hasClearButton: false,
  padding: "md",
  borderRadius: "md",
};

const PADDING = {
  sm: "0.5rem",
  md: "0.75rem",
};

const BORDER_RADIUS = {
  sm: "4px",
  md: "8px",
};

const Input = styled.input`
  border: 1px solid ${color("border")};
  outline: none;
  width: 100%;
  font-size: 1.12em;
  font-weight: 700;
  color: ${color("text-dark")};
  min-width: 200px;

  ${({ borderRadius, padding }) => css`
    border-radius: ${BORDER_RADIUS[borderRadius]};
    padding: ${PADDING[padding]};
  `}

  ${props =>
    props.hasClearButton
      ? css`
          padding-right: 26px;
        `
      : null}

  ${props =>
    props.hasIcon
      ? css`
          padding-left: 36px;
        `
      : null}

  &:focus {
    border-color: ${color("brand")};
  }
`;

const TextInputRoot = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const ClearButton = styled.button`
  display: flex;
  position: absolute;
  right: 12px;
  color: ${color("bg-dark")};
  cursor: pointer;

  &:hover {
    color: ${color("text-dark")};
  }
`;

const IconWrapper = styled.span`
  position: absolute;
  padding-left: 0.75rem;
  color: ${color("text-light")};
`;

export default forwardRef(function TextInputWithForwardedRef(props, ref) {
  return <TextInput forwardedRef={ref} {...props} />;
});
