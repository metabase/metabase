import styled from "@emotion/styled";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const SidebarRoot = styled.div`
  margin-left: 1rem;
  width: 26.25rem;

  ${breakpointMinSmall} {
    margin-left: 2rem;
  }
`;
