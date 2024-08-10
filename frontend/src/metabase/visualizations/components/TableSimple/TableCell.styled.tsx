import { css } from "@emotion/react";
import styled from "@emotion/styled";

import type { MantineTheme } from "metabase/ui";

interface CellRootProps {
  isRightAligned: boolean;
  backgroundColor?: string;
}

interface CellContentProps {
  isClickable: boolean;
  isHighlighted: boolean;
}

export const TableCell = styled.td<CellRootProps>`
  padding-left: 0.5em;
  padding-right: 0.5em;
  color: var(--mb-color-text-primary);
  font-weight: bold;
  text-align: ${props => (props.isRightAligned ? "right" : "unset")};
  white-space: nowrap;
  border-bottom: 1px solid var(--mb-color-border);
  background-color: ${props =>
    props.backgroundColor ??
    props.theme.other.table.cell.backgroundColor ??
    "unset"};
`;

export const TableCellContent = styled.span<CellContentProps>`
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
  const tableTheme = options.theme.other.table;

  if (options.isHighlighted) {
    return css`
      color: ${tableTheme.idColumn?.textColor ?? "var(--mb-color-brand)"};
    `;
  }

  return css`
    color: ${tableTheme.cell.textColor};
  `;
}

/**
 * TableCell component represents a table cell with customizable alignment and background color.
 * @param {boolean} isRightAligned - Determines if the text should be right-aligned.
 * @param {string} [backgroundColor] - Optional background color for the cell.
 */

/**
 * TableCellContent component represents the content within a table cell, with options for clickability and highlighting.
 * @param {boolean} isClickable - Determines if the content is clickable.
 * @param {boolean} isHighlighted - Determines if the content is highlighted.
 */

/**
 * getCellColor function returns the appropriate text color based on the highlighted state and theme.
 * @param {boolean} isHighlighted - Determines if the content is highlighted.
 * @param {MantineTheme} theme - The theme object for styling.
 * @returns {SerializedStyles} - The serialized styles for the text color.
 */

// Add ARIA attributes and ensure color contrast meets accessibility standards
export const AccessibleTableCell = styled(TableCell)<CellRootProps>`
  &:focus {
    outline: 2px solid var(--mb-color-focus);
  }
  background-color: ${props =>
    props.backgroundColor ??
    props.theme.other.table.cell.backgroundColor ??
    "unset"};
  color: var(--mb-color-text-primary);
  font-weight: bold;
  text-align: ${props => (props.isRightAligned ? "right" : "unset")};
  white-space: nowrap;
  border-bottom: 1px solid var(--mb-color-border);
`;

export const AccessibleTableCellContent = styled(TableCellContent)<CellContentProps>`
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
  &:focus {
    outline: 2px solid var(--mb-color-focus);
  }
`;
