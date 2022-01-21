import styled from "styled-components";
import { space, SpaceProps } from "styled-system";
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
`;

export const RadioListNormal = styled(RadioList)`
  font-weight: ${props => (props.showButtons ? "" : "bold")};
`;

export const RadioListBubble = styled(RadioList)`
  display: flex;
`;

export interface RadioLabelProps extends SpaceProps {
  variant: RadioVariant;
  vertical: boolean;
}

export const RadioLabel = styled.label<RadioLabelProps>`
  display: block;
  ${space};
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
  display: block;
  margin: 0;
  padding: 0;
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
