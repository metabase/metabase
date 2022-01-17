import styled from "styled-components";
import { color } from "metabase/lib/colors";
import { ButtonVariant } from "./types";

interface ButtonRootProps {
  variant: ButtonVariant;
}

const getColor = ({ variant }: ButtonRootProps): string => {
  switch (variant) {
    case "primary":
      return color("bg-light");
    case "secondary":
      return color("text-dark");
    case "error":
      return color("bg-light");
  }
};

const getBorderColor = ({ variant }: ButtonRootProps): string => {
  switch (variant) {
    case "primary":
      return color("brand");
    case "secondary":
      return color("border");
    case "error":
      return color("error");
  }
};

const getBackgroundColor = ({ variant }: ButtonRootProps): string => {
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
  font-weight: bold;
  cursor: pointer;
  padding: 0.75rem 1.125rem;
  border: 1px solid ${getBorderColor};
  border-radius: 0.375rem;
  background-color: ${getBackgroundColor};
`;
