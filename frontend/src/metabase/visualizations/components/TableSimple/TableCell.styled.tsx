import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";

export const CellRoot = styled.td<{
  isRightAligned: boolean;
  backgroundColor?: string;
}>`
  padding-left: 0.5rem;
  padding-right: 0.5rem;

  color: ${color("text-dark")};
  font-weight: bold;
  text-align: ${props => (props.isRightAligned ? "right" : "unset")};
  white-space: nowrap;

  border-bottom: 1px solid ${color("border")};

  background-color: ${props => props.backgroundColor ?? "unset"};
`;

export const CellContent = styled.span<{ isClickable: boolean }>`
  display: inline-block;

  ${props =>
    props.isClickable &&
    css`
      cursor: pointer;
      &:hover {
        color: ${color("brand")};
      }
    `}
`;
