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

export interface RadioContainerProps {
  variant: RadioVariant;
  vertical: boolean;
}

export const RadioContainer = styled.label<RadioContainerProps>`
  display: block;
  ${props => props.variant === "normal" && RadioContainerNormal};
  ${props => props.variant === "underlined" && RadioContainerNormal};
  ${props => props.variant === "bubble" && RadioContainerBubble};
`;

const RadioContainerNormal = css<RadioContainerProps>`
  &:not(:last-child) {
    margin-right: ${props => (!props.vertical ? "2rem" : "")};
    margin-bottom: ${props => (props.vertical ? "0.5rem" : "")};
  }
`;

const RadioContainerBubble = css<RadioContainerProps>`
  &:not(:last-child) {
    margin-right: ${props => (!props.vertical ? "0.5rem" : "")};
    margin-bottom: ${props => (props.vertical ? "0.5rem" : "")};
  }
`;

export interface RadioItemProps {
  checked: boolean;
  variant: RadioVariant;
  colorScheme: RadioColorScheme;
  disabled: boolean;
}

export const RadioItem = styled.label<RadioItemProps>`
  display: flex;
  align-items: center;
  cursor: ${props => (props.disabled ? "" : "pointer")};
  ${props => props.variant === "normal" && RadioItemNormal};
  ${props => props.variant === "underlined" && RadioItemUnderlined};
  ${props => props.variant === "bubble" && RadioItemBubble};
`;

const RadioItemNormal = css<RadioItemProps>`
  color: ${props => (props.checked ? getSchemeColor(props.colorScheme) : "")};
`;

const RadioItemUnderlined = css<RadioItemProps>`
  color: ${props => (props.checked ? getSchemeColor(props.colorScheme) : "")};
  border-bottom: 3px solid
    ${props =>
      props.checked ? getSchemeColor(props.colorScheme) : "transparent"};
  padding: 1rem 0;
`;

const RadioItemBubble = css<RadioItemProps>`
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
