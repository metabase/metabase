// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Link from "metabase/common/components/Link";
import { GridItem } from "metabase/components/Grid";
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
    color: ${() => color("accent2")};
  }
`;
