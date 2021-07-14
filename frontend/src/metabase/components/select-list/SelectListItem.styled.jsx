import styled, { css } from "styled-components";

import Label from "metabase/components/type/Label";
import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const ItemTitle = styled(Label)`
  margin: 0;
  padding-left: 0.5rem;
  flex-grow: 1;
`;

export const ItemIcon = styled(Icon)`
  color: ${props =>
    props.isHighlighted ? colors["brand"] : colors["text-light"]};
`;

const activeItemCss = css`
  background-color: ${colors["brand"]};

  ${ItemIcon},
  ${ItemTitle} {
    color: ${colors["white"]};
  }
`;

const VERTICAL_PADDING_BY_SIZE = {
  small: "0.5rem",
  medium: "0.75rem",
};

export const ItemRoot = styled.li`
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: ${props => VERTICAL_PADDING_BY_SIZE[props.size]} 0.5rem;
  border-radius: 6px;
  margin-bottom: 2px;

  &:last-child {
    margin-bottom: 0;
  }

  ${props => props.isSelected && activeItemCss}

  &:hover {
    ${activeItemCss}
  }
`;
