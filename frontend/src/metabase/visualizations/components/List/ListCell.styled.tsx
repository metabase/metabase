import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";

import { CellType } from "./types";

function getCellWidth(type: CellType) {
  if (type === "image") {
    return "5%";
  }
  if (type === "primary") {
    return "10%";
  }
  return "unset";
}

export const CellRoot = styled.td<{ type: CellType }>`
  padding-left: 0.5rem;
  padding-right: 0.5rem;

  color: ${color("text-dark")};
  font-weight: bold;
  text-align: ${props => (props.type === "secondary" ? "right" : "left")};
  white-space: nowrap;

  width: ${props => getCellWidth(props.type)};
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
