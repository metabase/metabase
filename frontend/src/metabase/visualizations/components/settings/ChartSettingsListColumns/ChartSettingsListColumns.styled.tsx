import styled from "@emotion/styled";

import Select from "metabase/core/components/Select";
import { color } from "metabase/lib/colors";

export const GroupName = styled.p`
  font-weight: 700;
  color: ${color("text-medium")};
`;

export const StyledSelect = styled(Select)``;

export const ColumnItemContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;

  ${StyledSelect} {
    width: 100%;
  }
`;
