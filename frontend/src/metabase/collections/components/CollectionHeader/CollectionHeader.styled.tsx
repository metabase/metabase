import styled from "@emotion/styled";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const HeaderRoot = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  margin-bottom: 2rem;
  padding-top: 0.25rem;

  ${breakpointMinSmall} {
    align-items: center;
    flex-direction: row;
    padding-top: 0.5rem;
  }
`;

export const HeaderActions = styled.div`
  display: flex;
  margin-top: 0.5rem;
  align-self: start;
`;
