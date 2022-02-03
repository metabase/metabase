import styled from "styled-components";
import {
  breakpointMinSmall,
  breakpointMinMedium,
} from "metabase/styled-components/theme";

export const BrowseAppRoot = styled.div`
  margin: 0 0.5rem;

  ${breakpointMinSmall} {
    margin: 0 1rem;
  }

  ${breakpointMinMedium} {
    margin: 0 4rem;
  }
`;
