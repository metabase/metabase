import styled from "styled-components";

import CheckBox from "metabase/components/CheckBox";
import { color } from "metabase/lib/colors";

export const StackedCheckBoxRoot = styled.div`
  position: relative;
  transform: scale(1);
  opacity: ${props => (props.disabled ? 0.4 : 1)};
`;

export const OpaqueCheckBox = styled(CheckBox)`
  opacity: 1;
`;

export const StackedBackground = styled.div`
  width: ${props => `${props.size}px`};
  height: ${props => `${props.size}px`};
  border-radius: 4px;
  position: absolute;
  display: inline-block;

  z-index: -1;
  top: -3px;
  left: 3px;

  background: ${props =>
    props.checked ? color(props.checkedColor) : color("bg-white")};

  border: 2px solid
    ${props =>
      props.checked ? color(props.checkedColor) : color(props.uncheckedColor)};
`;

export const Label = styled(CheckBox.Label)`
  margin-top: -2px;
`;
