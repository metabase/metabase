import styled from "@emotion/styled";
import { Link } from "react-router";

import { color } from "metabase/lib/colors";

export const ActionLink = styled(Link)`
  display: block;
  padding: 0.5rem 1rem;
  cursor: pointer;
  text-decoration: none;

  &:hover {
    color: var(--mb-color-text-white);
    background-color: var(--mb-color-brand);
  }
`;

export const TriggerIconContainer = styled.span`
  color: var(--mb-color-text-light);

  &:hover {
    color: var(--mb-color-brand);
  }
`;
