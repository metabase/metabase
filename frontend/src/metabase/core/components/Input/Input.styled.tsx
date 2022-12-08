import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import { monospaceFontFamily, space } from "metabase/styled-components/theme";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { focusOutlineStyle } from "metabase/core/style/input";
import { InputSize } from "./types";

export interface InputProps {
  fieldSize?: InputSize;
  hasError?: boolean;
  fullWidth?: boolean;
  hasSubtitle?: boolean;
  hasLeftIcon?: boolean;
  hasRightIcon?: boolean;
  hasClearButton?: boolean;
  colorScheme: string;
}

export interface InputRootProps {
  fullWidth?: boolean;
}

const getHorizontalPadding = (
  inputSize?: InputSize,
  hasIcon?: boolean,
  hasClearButton?: boolean,
) => {
  let padding = inputSize === "small" ? 0.625 : 0.75;

  if (hasIcon) {
    padding += 1.5;
  }

  if (hasClearButton) {
    padding += 1;
  }

  return `${padding}rem`;
};

export const InputRoot = styled.div<InputRootProps>`
  display: inline-flex;
  align-items: center;
  position: relative;
  width: ${props => (props.fullWidth ? "100%" : "")};
`;

export const InputField = styled.input<InputProps>`
  font-family: inherit;
  font-weight: 700;
  font-size: 1rem;
  color: ${color("text-dark")};
  padding: 0.75rem;
  border: 1px solid ${color("border")};
  border-radius: ${space(1)};
  background-color: ${props => color(props.readOnly ? "bg-light" : "bg-white")};
  outline: none;
  text-align: inherit;

  &:focus,
  &:hover {
    border-color: ${props => color(props.colorScheme)};
    transition: border 300ms ease-in-out;
  }

  ${props => focusOutlineStyle(props.colorScheme)};

  ${props =>
    props.hasError &&
    css`
      border-color: ${color("error")};
    `};

  ${props =>
    props.fullWidth &&
    css`
      width: 100%;
    `}

  ${props =>
    props.fieldSize === "small" &&
    css`
      font-size: 0.875rem;
      line-height: 1rem;
    `};

  padding-left: ${props =>
    getHorizontalPadding(props.fieldSize, props.hasLeftIcon)};
  padding-right: ${props =>
    getHorizontalPadding(
      props.fieldSize,
      props.hasLeftIcon,
      props.hasClearButton,
    )};

  ${props =>
    props.hasSubtitle &&
    css`
      padding-top: 1.75rem;
    `};
`;

type InputButtonProps = {
  size: InputSize;
};
export const InputButton = styled(IconButtonWrapper)<InputButtonProps>`
  position: absolute;
  color: ${color("text-light")};
  padding: 0.75rem;
  border-radius: 50%;
  bottom: ${props => (props.size === "medium" ? "0.125rem" : 0)};

  &:disabled {
    cursor: default;
  }
`;

export const InputLeftButton = styled(InputButton)<InputButtonProps>`
  left: 0;
`;

export const InputRightButton = styled(InputButton)<InputButtonProps>`
  right: 0;
`;

type InputResetButtonProps = {
  hasRightIcon: boolean;
};

export const InputResetButton = styled(InputButton)<InputResetButtonProps>`
  right: ${props => (props.hasRightIcon ? "0.75rem" : 0)};
`;

export const InputSubtitle = styled.div`
  color: ${color("text-light")};
  position: absolute;
  top: 1.25em;
  left: 1.25em;
  font-family: ${monospaceFontFamily};
  font-size: 0.75em;
`;
