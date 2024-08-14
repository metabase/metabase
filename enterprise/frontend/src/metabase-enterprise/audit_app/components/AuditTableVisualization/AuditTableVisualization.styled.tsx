import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

interface HeaderCellProps {
  isSortable?: boolean;
  isSortedByColumn?: boolean;
  isRightAligned?: boolean;
}

export const HeaderCell = styled.th<HeaderCellProps>`
  cursor: ${props => props.isSortable && "pointer"};
  color: ${props => props.isSortedByColumn && "var(--mb-color-brand)"};
  text-align: ${props => props.isRightAligned && "right"};
  white-space: nowrap;

  &:hover {
    color: ${props => props.isSortable && "var(--mb-color-brand)"};
  }
`;

interface RowCellProps {
  isClickable?: boolean;
  isRightAligned?: boolean;
}

export const RowCell = styled.td<RowCellProps>`
  color: ${props => props.isClickable && "var(--mb-color-brand)"};
  cursor: ${props => props.isClickable && "pointer"};
  text-align: ${props => props.isRightAligned && "right"};
`;

export const RemoveRowButton = styled(IconButtonWrapper)`
  color: var(--mb-color-text-light);
`;
