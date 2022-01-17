import styled from "styled-components";
import { color } from "metabase/lib/colors";
import { ButtonVariant } from "./types";

interface ButtonRootProps {
  variant: ButtonVariant;
  disabled: boolean;
  fullWidth: boolean;
}

const getCursor = ({ disabled }: ButtonRootProps): string => {
  return disabled ? "default" : "pointer";
};

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

const getWidth = ({ fullWidth }: ButtonRootProps): string => {
  return fullWidth ? "100%" : "";
};

export const ButtonRoot = styled.button<ButtonRootProps>`
  appearance: none;
  color: ${getColor};
  cursor: ${getCursor};
  font-weight: bold;
  width: ${getWidth};
  padding: 0.75rem 1.125rem;
  border: 1px solid ${getBorderColor};
  border-radius: 0.375rem;
  background-color: ${getBackgroundColor};

  &:focus {
    outline: 0.125rem solid ${color("brand-light")};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;
