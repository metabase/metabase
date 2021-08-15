import styled, { css } from "styled-components";
import { color } from "metabase/lib/colors";

const PADDING = {
  sm: "0.5rem",
  md: "0.75rem",
};

const BORDER_RADIUS = {
  sm: "4px",
  md: "8px",
};

const COLOR_BY_VARIANT = {
  default: () => color("brand"),
  admin: () => color("accent7"),
};

export const Input = styled.input`
  border: 1px solid ${color("border")};
  outline: none;
  width: 100%;
  font-size: 1.12em;
  font-weight: 400;
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
    border-color: ${props => COLOR_BY_VARIANT[props.colorScheme]()};
  }
`;

export const TextInputRoot = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

export const ClearButton = styled.button`
  display: flex;
  position: absolute;
  right: 12px;
  color: ${color("bg-dark")};
  cursor: pointer;

  &:hover {
    color: ${color("text-dark")};
  }
`;

export const IconWrapper = styled.span`
  position: absolute;
  padding-left: 0.75rem;
  color: ${color("text-light")};
`;
