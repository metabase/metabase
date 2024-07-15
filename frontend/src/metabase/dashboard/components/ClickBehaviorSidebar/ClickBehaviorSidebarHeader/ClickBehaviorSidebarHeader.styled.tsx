import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ItemName = styled.span`
  color: ${color("brand")};
`;

export const ColumnClickBehaviorHeader = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export const ChevronIconContainer = styled.div`
  padding: 4px 6px;
  margin-right: 8px;
  border: 1px solid ${color("border")};
  border-radius: 4px;
`;
