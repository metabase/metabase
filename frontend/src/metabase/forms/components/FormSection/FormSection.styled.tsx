import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const CollapsibleSectionContent = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-bottom: 1rem;

  &:hover {
    color: ${color("brand")};
  }
`;
