import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import Card from "metabase/components/Card";
import { GridItem, Grid } from "metabase/components/Grid";

export const DatabaseGrid = styled(Grid)`
  width: 100%;
`;

export const DatabaseCard = styled(Card)`
  padding: 1.5rem;
  box-shadow: 0px 1px 4px 0px rgba(0, 0, 0, 0.06) !important;

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
