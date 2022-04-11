import styled from "@emotion/styled";
import {
  breakpointMinSmall,
  breakpointMinMedium,
} from "metabase/styled-components/theme";
import { GridItem } from "metabase/components/Grid";

export const CollectionGridItem = styled(GridItem)`
  width: 100%;

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: 25%;
  }
`;
