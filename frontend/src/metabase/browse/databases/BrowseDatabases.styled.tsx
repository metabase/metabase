import styled from "@emotion/styled";
import { Link } from "react-router";

import Card from "metabase/components/Card";

export const DatabaseCard = styled(Card)`
  padding: 1.5rem;
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
