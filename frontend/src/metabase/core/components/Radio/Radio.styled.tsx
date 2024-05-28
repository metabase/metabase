import styled from "@emotion/styled";

import { color, lighten, tint, isDark } from "metabase/lib/colors";

import type { RadioColorScheme, RadioVariant } from "./types";

export interface RadioGroupProps {
  variant: RadioVariant;
  vertical: boolean;
}

export const RadioGroup = styled.div<RadioGroupProps>`
  display: flex;
  flex-direction: ${props => (props.vertical ? "column" : "row")};
`;

export const RadioGroupNormal = styled(RadioGroup)`
  font-weight: bold;
`;

export const RadioGroupBubble = styled(RadioGroup)`
  display: flex;
`;

export interface RadioLabelProps {
  variant: RadioVariant;
  vertical: boolean;
}

export const RadioLabel = styled.label<RadioLabelProps>`
  display: block;
`;

export const RadioLabelNormal = styled(RadioLabel)`
  &:not(:last-child) {
    margin-right: ${props => (!props.vertical ? "2rem" : "")};
    margin-bottom: ${props => (props.vertical ? "0.5rem" : "")};
  }
`;

export const RadioLabelBubble = styled(RadioLabel)`
  &:not(:last-child) {
    margin-right: ${props => (!props.vertical ? "0.5rem" : "")};
    margin-bottom: ${props => (props.vertical ? "0.5rem" : "")};
  }
`;

export const RadioInput = styled.input`
  appearance: none;
  display: block;
  margin: 0;
  padding: 0;
`;

export interface RadioContainerProps {
  checked: boolean;
  variant: RadioVariant;
  colorScheme: RadioColorScheme;
  disabled: boolean;
  showButtons: boolean;
}

export const RadioContainer = styled.div<RadioContainerProps>`
  display: flex;
  align-items: center;
  cursor: ${props => (props.disabled ? "" : "pointer")};

  &:hover {
    color: ${props =>
      !props.checked && !props.showButtons
        ? getSchemeColor(props.colorScheme)
        : ""};
  }

  ${RadioInput}:focus + & {
    outline: 2px solid ${color("focus")};
  }

  ${RadioInput}:focus:not(:focus-visible) + & {
    outline: none;
  }
`;

export const RadioContainerNormal = styled(RadioContainer)`
  color: ${props => (props.checked ? getSchemeColor(props.colorScheme) : "")};
`;

export const RadioContainerUnderlined = styled(RadioContainer)`
  color: ${props => (props.checked ? getSchemeColor(props.colorScheme) : "")};
  border-bottom: 3px solid
    ${props =>
      props.checked ? getSchemeColor(props.colorScheme) : "transparent"};
  padding: 1rem 0;
`;

export const RadioContainerBubble = styled(RadioContainer)`
  padding: 0.5rem 1rem;
  border-radius: 10rem;
  font-weight: bold;
  color: ${props =>
    props.checked ? color("white") : getContrastSchemeColor(props.colorScheme)};
  background-color: ${props =>
    props.checked
      ? getSchemeColor(props.colorScheme)
      : lighten(getSchemeColor(props.colorScheme))};

  &:hover {
    color: ${props =>
      !props.checked && !props.showButtons
        ? getContrastSchemeColor(props.colorScheme)
        : ""};
    background-color: ${props =>
      props.checked ? "" : lighten(getSchemeColor(props.colorScheme), 0.38)};
    transition: background-color 300ms linear;
  }
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

export const RadioLabelText = styled.span`
  flex: 1 1 auto;
  display: block;
`;

const getSchemeColor = (colorScheme: RadioColorScheme): string => {
  switch (colorScheme) {
    case "default":
      return color("brand");
    case "accent7":
      return color("filter");
  }
};

const getContrastSchemeColor = (colorScheme: RadioColorScheme) => {
  const schemeColor = getSchemeColor(colorScheme);
  return isDark(schemeColor) ? tint(schemeColor, 0.5) : schemeColor;
};
