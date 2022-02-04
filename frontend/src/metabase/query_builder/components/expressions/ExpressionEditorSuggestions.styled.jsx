import styled from "styled-components";

import { forwardRefToInnerRef } from "metabase/styled-components/utils";
import { color } from "metabase/lib/colors";

export const UlStyled = styled.ul`
  min-width: 150px;
  overflow-y: auto;
`;

UlStyled.defaultProps = { className: "pb1" };

const listItemStyledClassName =
  "px2 cursor-pointer text-white-hover bg-brand-hover hover-parent hover--inherit";

export const ListItemStyled = forwardRefToInnerRef(styled.li`
  padding-top: 5px;
  padding-bottom: 5px;

  ${({ isHighlighted }) =>
    isHighlighted &&
    `
      color: ${color("white")};
      background-color: ${color("brand")};
  `})}
`);

ListItemStyled.defaultProps = {
  className: listItemStyledClassName,
};
