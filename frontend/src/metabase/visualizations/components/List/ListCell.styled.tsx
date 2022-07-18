import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";

import { CellSlot } from "./types";

function getCellAlignment(slot: CellSlot) {
  return slot === "left" ? "left" : "right";
}

export const CellRoot = styled.div<{ slot: CellSlot }>`
  padding-left: 0.5rem;
  padding-right: 0.5rem;

  color: ${color("text-dark")};
  font-weight: bold;
  text-align: ${props => getCellAlignment(props.slot)};
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
