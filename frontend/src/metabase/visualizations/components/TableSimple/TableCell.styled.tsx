import { css } from "@emotion/react";
import styled from "@emotion/styled";

import type { MantineTheme } from "metabase/ui";

export const CellRoot = styled.td<{
  isRightAligned: boolean;
  backgroundColor?: string;
}>`
  padding-left: 0.5rem;
  padding-right: 0.5rem;

  color: var(--mb-color-text-dark);
  font-weight: bold;
  text-align: ${props => (props.isRightAligned ? "right" : "unset")};
  white-space: nowrap;

  border-bottom: 1px solid var(--mb-color-border);

  background-color: ${props =>
    props.backgroundColor ??
    props.theme.other.table.cell.backgroundColor ??
    "unset"};
`;

export const CellContent = styled.span<{
  isClickable: boolean;
  isHighlighted: boolean;
}>`
  display: inline-block;

  ${({ theme, isHighlighted }) => getCellColor({ theme, isHighlighted })}

  ${props =>
    props.isClickable &&
    css`
      cursor: pointer;
      &:hover {
        color: var(--mb-color-brand);
      }
    `}
`;

function getCellColor(options: {
  isHighlighted: boolean;
  theme: MantineTheme;
}) {
  if (options.isHighlighted) {
    return css`
      color: var(--mb-color-brand);
    `;
  }

  const { textColor } = options.theme.other.table.cell;

  if (textColor) {
    return css`
      color: ${textColor};
    `;
  }
}
