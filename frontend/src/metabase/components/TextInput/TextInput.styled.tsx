import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import { ColorScheme, Size } from "./TextInput";

const PADDING = {
  sm: "0.5rem",
  md: "0.75rem",
};

const BORDER_RADIUS = {
  sm: "4px",
  md: "8px",
};

const BORDER_COLOR = {
  default: () => color("brand"),
  admin: () => color("accent7"),
  transparent: () => "transparent",
};

interface InputProps {
  colorScheme: ColorScheme;
  borderRadius: Size;
  padding: Size;
  hasClearButton?: boolean;
  hasIcon?: boolean;
  invalid?: boolean;
}

const getBorderColor = (colorScheme: ColorScheme, invalid?: boolean) => {
  if (invalid) {
    return color("error");
  }

  return colorScheme === "transparent" ? "transparent" : color("border");
};

export const Input = styled.input<InputProps>`
  border: 1px solid ${props => getBorderColor(props.colorScheme, props.invalid)};
  outline: none;
  width: 100%;
  font-size: 1.12em;
  font-weight: 400;
  color: ${color("text-dark")};
  min-width: 200px;
  background-color: ${props =>
    props.colorScheme === "transparent" ? "transparent" : color("white")};

  &:disabled {
    background-color: ${color("bg-light")};
  }

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
    border-color: ${props => BORDER_COLOR[props.colorScheme]()};
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
