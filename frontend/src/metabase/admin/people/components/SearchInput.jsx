import React from "react";
import PropTypes from "prop-types";
import styled, { css } from "styled-components";
import { color } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import { t } from "ttag";

export default function SearchInput({
  value,
  placeholder,
  onChange,
  className,
  hasClearButton,
}) {
  const handleClearClick = () => {
    onChange("");
  };

  const showClearButton = hasClearButton && value.length > 0;

  return (
    <SearchFieldRoot className={className}>
      <IconWrapper>
        <Icon name="search" size={16} />
      </IconWrapper>
      <Input
        hasClearButton
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />

      {showClearButton && (
        <ClearButton onClick={handleClearClick}>
          <Icon name="close" size={12} />
        </ClearButton>
      )}
    </SearchFieldRoot>
  );
}

SearchInput.propTypes = {
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  value: PropTypes.string,
  autoFocus: PropTypes.bool,
  className: PropTypes.string,
  hasClearButton: PropTypes.bool,
};

SearchInput.defaultProps = {
  placeholder: t`Find...`,
  value: "",
  autoFocus: false,
  hasClearButton: false,
};

const Input = styled.input`
  min-width: 286px;
  border-radius: 4px;
  border: 1px solid ${color("border")};
  padding: 0.75em 0.75em 0.75em 36px;
  outline: none;
  width: 100%;
  font-size: 1.12em;
  font-weight: 700;
  color: ${color("text-dark")};

  ${props =>
    props.hasClearButton
      ? css`
          padding-right: 26px;
        `
      : null}

  &:focus {
    border-color: ${color("brand")};
  }
`;

const SearchFieldRoot = styled.div`
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
