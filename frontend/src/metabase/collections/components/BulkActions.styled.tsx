import styled from "@emotion/styled";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const ActionBarContent = styled.div`
  padding: 0.5rem 1rem;
  display: flex;

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
