import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color, darken } from "metabase/lib/colors";

export interface InputProps {
  hasError?: boolean;
  hasTooltip?: boolean;
  fullWidth?: boolean;
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
  background-color: ${props => color(props.readOnly ? "bg-light" : "bg-white")};
  padding: 0.75rem;
  border: 1px solid ${darken("border", 0.1)};
  border-radius: 4px;
  outline: none;

  &:focus {
    border-color: ${color("brand")};
    transition: border 300ms ease-in-out;
  }

  ${props =>
    props.hasError &&
    css`
      border-color: ${color("error")};
    `};

  ${props =>
    props.hasTooltip &&
    css`
      padding-right: 2.25rem;
    `};

  ${props =>
    props.fullWidth &&
    css`
      width: 100%;
    `}
`;

export const InputIconContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  right: 0.75rem;
  color: ${color("text-light")};
  cursor: pointer;
  border-radius: 50%;
`;
