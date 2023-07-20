import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

interface HeaderCellProps {
  isSortable?: boolean;
  isSortedByColumn?: boolean;
  isRightAligned?: boolean;
}

export const HeaderCell = styled.th<HeaderCellProps>`
  cursor: ${props => props.isSortable && "pointer"};
  color: ${props => props.isSortedByColumn && color("brand")};
  text-align: ${props => props.isRightAligned && "right"};
  white-space: nowrap;

  &:hover {
    color: ${props => props.isSortable && color("brand")};
  }
`;

export const RemoveRowButton = styled(IconButtonWrapper)`
  color: ${color("text-light")};
`;
