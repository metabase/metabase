import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const SortDirectionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: ${color("white")};
  font-weight: 700;
  cursor: pointer;
`;
