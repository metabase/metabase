import cx from "classnames";
import styled from "styled-components";
import { space } from "styled-system";

import { color, lighten } from "metabase/lib/colors";

// BASE
const BaseList = styled.ul`
  display: flex;
  flex-direction: ${props => (props.vertical ? "column" : "row")};
`;

const BaseItem = styled.li.attrs({
  mr: props => (!props.vertical && !props.last ? props.xspace : null),
  mb: props => (props.vertical && !props.last ? props.yspace : null),
})`
  ${space}
  display: flex;
  align-items: center;
  cursor: pointer;
  :hover {
    color: ${props =>
      !props.showButtons && !props.selected ? color("brand") : null};
  }
`;

BaseItem.defaultProps = {
  xspace: 3,
  yspace: 1,
};

// BUBBLE
export const BubbleList = styled(BaseList)``;

export const BubbleItem = styled(BaseItem)`
  font-weight: 700;
  border-radius: 99px;
  color: ${props => (props.selected ? color("white") : color("brand"))};
  background-color: ${props =>
    props.selected ? color("brand") : lighten("brand")};
  :hover {
    background-color: ${props => !props.selected && lighten("brand", 0.38)};
    transition: background 300ms linear;
  }
`;

BubbleItem.defaultProps = {
  xspace: 1,
  py: 1,
  px: 2,
};

// NORMAL
export const NormalList = styled(BaseList).attrs({
  className: props => cx(props.className, { "text-bold": !props.showButtons }),
})``;

export const NormalItem = styled(BaseItem)`
  color: ${props => (props.selected ? color("brand") : null)};
`;

// UNDERLINE
export const UnderlinedList = styled(NormalList)``;

export const UnderlinedItem = styled(NormalItem)`
  border-bottom: 3px solid transparent;
  border-color: ${props => (props.selected ? color("brand") : null)};
`;

UnderlinedItem.defaultProps = {
  py: 2,
};
