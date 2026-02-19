// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import {
  getTooltipSeparatorStyle,
  tableRowSpacingStyle,
} from "../StackedDataTooltip/StackedDataTooltip.styled";

export const TooltipTable = styled.table`
  border-collapse: collapse;
  margin: 0.5rem 1rem;
`;

export const TableBody = styled.tbody<{
  hasBottomSpacing?: boolean;
}>`
  &:after {
    ${(props) => (props.hasBottomSpacing ? tableRowSpacingStyle : null)}
  }
`;

export const TableCell = styled.td`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
  padding: 0.125rem 0.0625rem;

  &:first-of-type {
    padding: 0.125rem 0.5rem 0.125rem 0.0625rem;
  }
`;

export const TableFooter = styled.tfoot`
  ${() => getTooltipSeparatorStyle()}

  &:before {
    ${tableRowSpacingStyle}
  }
`;
