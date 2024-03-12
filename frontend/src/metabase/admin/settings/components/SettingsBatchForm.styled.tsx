import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const CollapsibleSectionContent = styled.div`
  display: inline-block;
  margin-inline-start: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
