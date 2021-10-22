import styled from "styled-components";

import {
  breakpointMinSmall,
  breakpointMinMedium,
} from "metabase/styled-components/theme";

export const FullWidthContainer = styled.div`
  margin: 0 auto;
  padding: 0 1em;
  width: 100%;

  ${breakpointMinSmall} {
    padding-left: 2em;
    padding-right: 2em;
  }

  ${breakpointMinMedium} {
    padding-left: 3em;
    padding-right: 3em;
  }
`;
