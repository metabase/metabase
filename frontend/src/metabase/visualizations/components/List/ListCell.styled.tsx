import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";

export const CellRoot = styled.td`
  padding-left: 0.5rem;
  padding-right: 0.5rem;

  color: ${color("text-medium")};
  font-weight: bold;
  text-align: left;
  white-space: nowrap;
`;

export const CellContent = styled.span<{ isClickable: boolean }>`
  display: inline-block;

  img {
    border-radius: 99px;
    height: 36px !important;
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
