import React, { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import styled, { css } from "styled-components";
import { color } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import { t } from "ttag";

export default function ListSearchField({
  searchText,
  placeholder,
  autoFocus,
  onChange,
  className,
  hasClearButton,
}) {
  const inputRef = useRef();

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    // Call focus() with a small delay because instant input focus causes an abrupt scroll to top of page
    // when ListSearchField is used inside a popover. It seems that it takes a while for Tether library
    // to correctly position the popover.
    const timerId = setTimeout(
      () => inputRef.current && inputRef.current.focus(),
      50,
    );
    return () => clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClearClick = () => {
    onChange("");
  };

  const showClearButton = hasClearButton && searchText.length > 0;

  return (
    <SearchFieldRoot className={className}>
      <IconWrapper>
        <Icon name="search" size={16} />
      </IconWrapper>
      <Input
        hasClearButton
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={searchText}
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

ListSearchField.propTypes = {
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  searchText: PropTypes.string,
  autoFocus: PropTypes.bool,
  className: PropTypes.string,
  hasClearButton: PropTypes.bool,
};

ListSearchField.defaultProps = {
  placeholder: t`Find...`,
  searchText: "",
  autoFocus: false,
  hasClearButton: false,
};

const Input = styled.input`
  border-radius: 8px;
  border: 1px solid ${color("border")};
  padding: 0.5rem 0.5rem 0.5rem 32px;
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
  padding-left: 0.5rem;
  color: ${color("text-light")};
`;
