import styled from "@emotion/styled";
import { alpha } from "metabase/lib/colors";

export interface ListCellItemProps {
  isClickable: boolean;
}

export const ListCellItem = styled.div<ListCellItemProps>`
  border-color: ${props => props.isClickable && alpha("accent2", 0.2)};
`;
