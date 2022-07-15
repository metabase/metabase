import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";

export const CellRoot = styled.div<{ slot: "left" | "right" }>`
  padding-left: 0.5rem;
  padding-right: 0.5rem;

  color: ${color("text-dark")};
  font-weight: bold;
  text-align: ${props => props.slot};
  white-space: nowrap;
`;

export const CellContent = styled.span<{ isClickable: boolean }>`
  display: inline-block;

  img {
    border-radius: 99px;
  }

  ${props =>
    props.isClickable &&
    css`
      cursor: pointer;
      &:hover {
        color: ${color("brand")};
      }
    `}
`;
