import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { InputSize } from "./types";

export interface InputProps {
  fieldSize?: InputSize;
  hasError?: boolean;
  fullWidth?: boolean;
  hasLeftIcon?: boolean;
  hasRightIcon?: boolean;
}

export const InputRoot = styled.div<InputProps>`
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

  &:focus {
    border-color: ${() => color("brand")};
    transition: border 300ms ease-in-out;
  }

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
    props.hasLeftIcon &&
    css`
      padding-left: 2.25rem;
    `};

  ${props =>
    props.hasRightIcon &&
    css`
      padding-right: 2.25rem;
    `};

  ${props =>
    props.fieldSize === "small" &&
    css`
      font-size: 0.875rem;
      line-height: 1rem;
      padding: 0.4375rem 0.625rem;
    `};
`;

export const InputButton = styled(IconButtonWrapper)`
  position: absolute;
  color: ${color("text-light")};
  padding: 0.75rem;
  border-radius: 50%;
`;

export const InputLeftButton = styled(InputButton)`
  left: 0;
`;

export const InputRightButton = styled(InputButton)`
  right: 0;
`;
