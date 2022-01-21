import styled, { css } from "styled-components";
import { color } from "metabase/lib/colors";
import { RadioColorScheme, RadioVariant } from "./types";

export interface RadioListProps {
  variant: RadioVariant;
  vertical: boolean;
  showButtons: boolean;
}

const RadioListNormal = css<RadioListProps>`
  font-weight: ${props => (props.showButtons ? "" : "bold")};
`;

export const RadioList = styled.div<RadioListProps>`
  display: flex;
  flex-direction: ${props => (props.vertical ? "column" : "row")};
  ${props => props.variant === "normal" && RadioListNormal};
`;

export interface RadioItemProps {
  disabled?: boolean;
}

export const RadioItem = styled.label<RadioItemProps>`
  display: flex;
  align-items: center;
  cursor: ${props => (props.disabled ? "" : "pointer")};
`;

export const RadioContainer = styled.label`
  display: block;
`;

export const RadioInput = styled.input`
  appearance: none;
`;

interface RadioButtonProps {
  checked: boolean;
  colorScheme: RadioColorScheme;
}

export const RadioButton = styled.span<RadioButtonProps>`
  display: block;
  flex: 0 0 auto;
  width: 0.75rem;
  height: 0.75rem;
  margin-right: 0.5rem;
  border: 2px solid white;
  border-radius: 0.75rem;
  box-shadow: 0 0 0 2px
    ${props =>
      props.checked ? getSchemeColor(props.colorScheme) : color("text-medium")};
  background-color: ${props =>
    props.checked ? getSchemeColor(props.colorScheme) : "transparent"};
`;

export const RadioText = styled.span`
  display: block;
`;

const getSchemeColor = (colorScheme: RadioColorScheme): string => {
  switch (colorScheme) {
    case "default":
      return color("brand");
    case "accent7":
      return color("accent7");
  }
};
