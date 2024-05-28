import styled from "@emotion/styled";

import {
  breakpointMinSmall,
  breakpointMinMedium,
} from "metabase/styled-components/theme";

export const FullWidthContainer = styled.div`
  margin: 0 auto;
  padding: 0 1em;
  width: 100%;

  ${breakpointMinSmall} {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }

  ${breakpointMinMedium} {
    padding-left: 2rem;
    padding-right: 2rem;
  }
`;
