import styled from "@emotion/styled";

import { GridItem } from "metabase/components/Grid";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const SchemaGridItem = styled(GridItem)`
  width: 100%;

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: 33.33%;
  }
`;

export const SchemaLink = styled(Link)`
  margin-bottom: 0.5rem;
  overflow: hidden;

  &:hover {
    color: ${color("accent2")};
  }
`;

export const SchemaBrowserContainer = styled.div`
  width: 100%;
`;
