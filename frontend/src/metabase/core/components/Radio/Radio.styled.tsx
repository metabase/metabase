import styled, { css } from "styled-components";
import { color, lighten } from "metabase/lib/colors";
import { RadioColorScheme, RadioVariant } from "./types";

export interface RadioListProps {
  variant: RadioVariant;
  vertical: boolean;
  showButtons: boolean;
}

export const RadioList = styled.div<RadioListProps>`
  display: flex;
  flex-direction: ${props => (props.vertical ? "column" : "row")};
  ${props => props.variant === "normal" && RadioListNormal};
  ${props => props.variant === "underlined" && RadioListNormal};
`;

const RadioListNormal = css<RadioListProps>`
  font-weight: ${props => (props.showButtons ? "" : "bold")};
`;

export interface RadioLabelProps {
  variant: RadioVariant;
  vertical: boolean;
}

export const RadioLabel = styled.label<RadioLabelProps>`
  display: block;
  ${props => props.variant === "normal" && RadioLabelNormal};
  ${props => props.variant === "underlined" && RadioLabelNormal};
  ${props => props.variant === "bubble" && RadioLabelBubble};
`;

const RadioLabelNormal = css<RadioLabelProps>`
  &:not(:last-child) {
    margin-right: ${props => (!props.vertical ? "2rem" : "")};
    margin-bottom: ${props => (props.vertical ? "0.5rem" : "")};
  }
`;

const RadioLabelBubble = css<RadioLabelProps>`
  &:not(:last-child) {
    margin-right: ${props => (!props.vertical ? "0.5rem" : "")};
    margin-bottom: ${props => (props.vertical ? "0.5rem" : "")};
  }
`;

export interface RadioContainerProps {
  checked: boolean;
  variant: RadioVariant;
  colorScheme: RadioColorScheme;
  disabled: boolean;
}

export const RadioContainer = styled.label<RadioContainerProps>`
  display: flex;
  align-items: center;
  cursor: ${props => (props.disabled ? "" : "pointer")};
  ${props => props.variant === "normal" && RadioContainerNormal};
  ${props => props.variant === "underlined" && RadioContainerUnderlined};
  ${props => props.variant === "bubble" && RadioContainerBubble};
`;

const RadioContainerNormal = css<RadioContainerProps>`
  color: ${props => (props.checked ? getSchemeColor(props.colorScheme) : "")};
`;

const RadioContainerUnderlined = css<RadioContainerProps>`
  color: ${props => (props.checked ? getSchemeColor(props.colorScheme) : "")};
  border-bottom: 3px solid
    ${props =>
      props.checked ? getSchemeColor(props.colorScheme) : "transparent"};
  padding: 1rem 0;
`;

const RadioContainerBubble = css<RadioContainerProps>`
  padding: 0.5rem 1rem;
  border-radius: 10rem;
  font-weight: bold;
  color: ${props =>
    props.checked ? color("white") : getSchemeColor(props.colorScheme)};
  background-color: ${props =>
    props.checked
      ? getSchemeColor(props.colorScheme)
      : lighten(getSchemeColor(props.colorScheme))};

  &:hover {
    background-color: ${props =>
      props.checked ? "" : lighten(getSchemeColor(props.colorScheme), 0.38)};
    transition: background-color 300ms linear;
  }
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
