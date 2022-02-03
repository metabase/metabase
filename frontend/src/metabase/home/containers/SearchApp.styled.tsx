import styled from "styled-components";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const SearchRoot = styled.div`
  margin: 0 0.5rem;

  ${breakpointMinSmall} {
    margin: 0 1rem;
  }

  ${breakpointMinMedium} {
    margin: 0 4rem;
  }
`;

export const SearchHeader = styled.div`
  display: flex;
  padding: 1rem 0;

  ${breakpointMinSmall} {
    padding: 2rem 0;
  }
`;
