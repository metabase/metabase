import styled, { css } from "styled-components";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const CheckboxRoot = styled.label`
  display: block;
  cursor: pointer;

  ${props =>
    props.disabled &&
    css`
      opacity: 0.4;
      pointer-events: none;
    `}
`;

export const Container = styled.div`
  display: flex;
  align-items: center;
`;

export const VisibleBox = styled.span`
  display: flex;
  align-items: center;
  justify-center: center;
  position: relative;
  width: ${props => `${props.size}px`};
  height: ${props => `${props.size}px`};

  background-color: ${props =>
    props.checked ? color(props.checkedColor) : color("bg-white")};

  border: 2px solid
    ${props =>
      props.checked ? color(props.checkedColor) : color(props.uncheckedColor)};

  border-radius: 4px;

  ${props =>
    props.isFocused &&
    !props.checked &&
    css`
      outline: 1px auto ${color(props.checkedColor)};
    `}
`;

export const Input = styled.input.attrs({ type: "checkbox" })`
  cursor: inherit;
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  margin: 0;
  padding: 0;
  z-index: 1;
`;

export const CheckboxIcon = styled(Icon)`
  position: absolute;
  color: ${props =>
    props.checked ? color("white") : color(props.uncheckedColor)};
`;

export const LabelText = styled.span`
  margin-left: 8px;
`;
