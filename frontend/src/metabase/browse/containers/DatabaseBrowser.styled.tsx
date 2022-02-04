import styled from "styled-components";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const DatabaseGridItem = styled.div`
  width: 100%;

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: 33.33%;
  }
`;
