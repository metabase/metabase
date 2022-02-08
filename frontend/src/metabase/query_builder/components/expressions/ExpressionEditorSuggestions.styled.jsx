import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const UlStyled = styled.ul`
  min-width: 150px;
  overflow-y: auto;
`;

export const ListItemStyled = styled.li`
  padding-top: 5px;
  padding-bottom: 5px;

  ${({ isHighlighted }) =>
    isHighlighted &&
    `
      color: ${color("white")};
      background-color: ${color("brand")};
  `})}
`;
