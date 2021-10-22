import styled from "styled-components";

import { color } from "metabase/lib/colors";

export const UlStyled = styled.ul.attrs({ className: "pb1" })`
  min-width: 150px;
  overflow-y: auto;
`;

const sectionTitleClassName =
  "mx2 h6 text-uppercase text-bold text-medium py1 pt2";

export const SectionTitle = styled.li.attrs({
  className: sectionTitleClassName,
})``;

const listItemStyledClassName =
  "px2 cursor-pointer text-white-hover bg-brand-hover hover-parent hover--inherit";

export const ListItemStyled = styled.li.attrs({
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
`;
