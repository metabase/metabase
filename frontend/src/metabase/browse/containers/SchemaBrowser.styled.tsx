import styled from "@emotion/styled";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import { GridItem } from "metabase/components/Grid";

export const SchemaGridItem = styled(GridItem)`
  width: 100%;

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: 33.33%;
  }
`;

export const SchemaCardContent = styled.div`
  display: flex;
  align-items: center;
`;

export const SchemaCardActions = styled.div`
  margin-left: auto;
`;
