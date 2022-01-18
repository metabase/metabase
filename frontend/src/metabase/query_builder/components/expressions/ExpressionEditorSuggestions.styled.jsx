import styled from "styled-components";

import { forwardRefToInnerRef } from "metabase/styled-components/utils";
import { color } from "metabase/lib/colors";

export const UlStyled = styled.ul.attrs({ className: "pb1" })`
  min-width: 150px;
  overflow-y: auto;
`;

const listItemStyledClassName =
  "px2 cursor-pointer text-white-hover bg-brand-hover hover-parent hover--inherit";

export const ListItemStyled = forwardRefToInnerRef(styled.li.attrs({
  className: listItemStyledClassName,
})`
  padding-top: 5px;
  padding-bottom: 5px;

  ${({ isHighlighted }) =>
    isHighlighted &&
    `
      color: ${color("white")};
      background-color: ${color("brand")};
  `})}
`);
