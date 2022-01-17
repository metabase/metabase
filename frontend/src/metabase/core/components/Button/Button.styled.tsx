import styled from "styled-components";
import { color } from "metabase/lib/colors";
import { ButtonVariant } from "./types";

interface ButtonRootProps {
  variant: ButtonVariant;
  disabled?: boolean;
  round?: boolean;
  fullWidth?: boolean;
}

const getColor = ({ variant, disabled }: ButtonRootProps): string => {
  if (disabled) {
    return color("text-light");
  }

  switch (variant) {
    case "primary":
      return color("bg-light");
    case "secondary":
      return color("text-dark");
    case "error":
      return color("bg-light");
  }
};

const getBorderColor = ({ variant, disabled }: ButtonRootProps): string => {
  if (disabled) {
    return color("border");
  }

  switch (variant) {
    case "primary":
      return color("brand");
    case "secondary":
      return color("border");
    case "error":
      return color("error");
  }
};

const getBackgroundColor = ({ variant, disabled }: ButtonRootProps): string => {
  if (disabled) {
    return "transparent";
  }

  switch (variant) {
    case "primary":
      return color("brand");
    case "secondary":
      return "transparent";
    case "error":
      return color("error");
  }
};

export const ButtonRoot = styled.button<ButtonRootProps>`
  appearance: none;
  color: ${getColor};
  cursor: ${({ disabled }) => (disabled ? "default" : "pointer")};
  font-weight: bold;
  width: ${({ fullWidth }) => (fullWidth ? "100%" : "")};
  padding: 0.75rem 1.125rem;
  border: 1px solid ${getBorderColor};
  border-radius: ${({ round }) => (round ? "10rem" : "0.375rem")};
  background-color: ${getBackgroundColor};

  &:focus {
    outline: 0.125rem solid ${color("brand-light")};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;
