import styled from "@emotion/styled";
import { alpha } from "metabase/lib/colors";

export interface ListCellItemProps {
  isClickable: boolean;
}

export const ListCellItem = styled.div<ListCellItemProps>`
  border-color: ${props => props.isClickable && alpha("accent2", 0.2)};
`;

export const FilterContainer = styled.div`
  padding: 0.5rem;
`;

export const Content = styled.div<{ isClickable: boolean }>`
  display: flex;
  align-items: center;
  flex: auto;
  padding: 0.5rem;
  cursor: ${props => (props.isClickable ? "pointer" : "default")};
`;
