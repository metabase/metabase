import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Link from "metabase/core/components/Link";
import { space } from "metabase/styled-components/theme";

export const TableGrid = styled(Grid)`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
`;

export const TableGridItem = styled(GridItem)`
  width: 100%;
`;

export const TableLink = styled(Link)`
  display: block;
  margin-inline-start: ${space(1)};
  overflow: hidden;
`;

export const TableActionLink = styled(Link)`
  line-height: initial;

  &:not(:first-of-type) {
    margin-inline-start: ${space(1)};
  }
`;

export const TableCard = styled(Card)`
  padding-inline-start: ${space(1)};
  padding-inline-end: ${space(1)};

  ${TableActionLink} {
    visibility: hidden;
  }

  &:hover ${TableActionLink} {
    visibility: visible;
  }
`;
