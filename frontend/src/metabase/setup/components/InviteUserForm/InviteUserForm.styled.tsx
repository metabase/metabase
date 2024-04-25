import styled from "@emotion/styled";

import { breakpointMinSmall } from "metabase/styled-components/theme";

export const UserFieldGroup = styled.div`
  ${breakpointMinSmall} {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
`;
