import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ColorRangeRoot = styled.div`
  display: flex;
  height: 2rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  cursor: pointer;
  overflow: hidden;
`;

export const ColorRangeItem = styled.div`
  flex: 1 0 auto;
`;
