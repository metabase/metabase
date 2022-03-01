import styled from "@emotion/styled";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const HomepageRoot = styled.div`
  padding: 0 1rem;

  ${breakpointMinSmall} {
    padding: 0 2rem;
  }

  ${breakpointMinMedium} {
    padding: 0 4rem;
  }
`;
