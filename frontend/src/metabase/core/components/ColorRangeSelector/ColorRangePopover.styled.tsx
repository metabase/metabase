import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const PopoverRoot = styled.div`
  padding: 0.75rem;
  width: 19.25rem;
`;

export const PopoverColorList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
`;

export const PopoverColorRangeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

export const PopoverDivider = styled.div`
  margin: 0.75rem -0.75rem;
  border-top: 1px solid ${color("border")};
`;
