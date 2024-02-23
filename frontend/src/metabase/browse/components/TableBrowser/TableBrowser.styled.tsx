import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Link from "metabase/core/components/Link";
import {
  breakpointMinMedium,
  breakpointMinSmall,
  space,
} from "metabase/styled-components/theme";

export const TableGrid = styled(Grid)`
  width: 100%;
`;

export const TableGridItem = styled(GridItem)`
  width: 100%;

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: 33.33%;
  }
`;

export const TableLink = styled(Link)`
  display: block;
  margin-left: ${space(1)};
  overflow: hidden;
`;

export const TableActionLink = styled(Link)`
  line-height: initial;

  &:not(:first-of-type) {
    margin-left: ${space(1)};
  }
`;

export const TableCard = styled(Card)`
  padding-left: ${space(1)};
  padding-right: ${space(1)};

  ${TableActionLink} {
    visibility: hidden;
  }

  &:hover ${TableActionLink} {
    visibility: visible;
  }
`;
