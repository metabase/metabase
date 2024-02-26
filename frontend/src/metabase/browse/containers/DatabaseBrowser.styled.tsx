import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import { GridItem } from "metabase/components/Grid";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const DatabaseCard = styled(Card)`
  padding: 1.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;

export const DatabaseGridItem = styled(GridItem)`
  width: 100%;

  &:hover {
    color: ${color("brand")};
  }

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: 33.33%;
  }
`;
