import styled from "styled-components";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const NotebookRoot = styled.div`
  position: relative;
  padding: 0 1rem;
  margin-bottom: 2rem;

  ${breakpointMinSmall} {
    padding: 0 2rem;
  }
`;
