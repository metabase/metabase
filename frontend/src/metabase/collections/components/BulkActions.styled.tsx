import styled from "styled-components";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const ActionBarContent = styled.div`
  padding: 0.5rem 1rem;

  ${breakpointMinSmall} {
    padding-left: 2rem;
    padding-right: 2rem;
  }
`;

export const ActionBarText = styled.div`
  margin-left: auto;
`;

export const ActionControlsRoot = styled.div`
  margin-left: 0.5rem;
`;

export const GridItemContent = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 1rem;
`;
