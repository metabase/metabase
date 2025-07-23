import styled from "@emotion/styled";

import { breakpointMinLarge } from "metabase/styled-components/theme";

export const SectionContent = styled.div`
  display: flex;
  flex-direction: column;

  ${breakpointMinLarge} {
    flex-direction: row;
  }
`;
