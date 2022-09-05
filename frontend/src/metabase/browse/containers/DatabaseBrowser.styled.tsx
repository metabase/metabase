import styled from "@emotion/styled";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import { GridItem } from "metabase/components/Grid";

export const DatabaseGridItem = styled(GridItem)`
  width: 100%;

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: 33.33%;
  }
`;
