import styled from "@emotion/styled";
import { Link } from "react-router";

import Card from "metabase/components/Card";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import { Grid } from "metabase/ui";

export const DatabaseGrid = styled(Grid)`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 0 1rem;
  margin: 0;
  width: 100%;

  ${breakpointMinSmall} {
    padding-bottom: 2.5rem;
  }
  ${breakpointMinMedium} {
    padding-bottom: 3rem;
  }
`;

export const DatabaseCard = styled(Card)`
  padding: 1.5rem;
  margin-bottom: 1rem;
  box-shadow: none;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const DatabaseCardLink = styled(Link)`
  &:hover {
    color: var(--mb-color-brand);
  }
`;
