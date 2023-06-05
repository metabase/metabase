import styled from "@emotion/styled";
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

export const SearchEmptyState = styled.div`
  width: 66.66%;
`;

export const SearchBody = styled.div`
  display: flex;
  align-items: start;
`;

export const SearchMain = styled.div`
  width: 66.66%;
`;

export const SearchControls = styled.div`
  padding: 1rem 1rem 0 1rem;
  margin-left: 0.5rem;

  ${breakpointMinSmall} {
    margin-left: 1rem;
  }
`;
