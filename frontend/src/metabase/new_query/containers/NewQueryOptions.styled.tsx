import styled from "styled-components";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const QueryOptionsRoot = styled.div`
  margin: auto 0.5rem;

  ${breakpointMinSmall} {
    margin-left: 4rem;
    margin-right: 4rem;
  }
`;
