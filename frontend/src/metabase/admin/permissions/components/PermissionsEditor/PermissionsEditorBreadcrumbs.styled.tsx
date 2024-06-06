import styled from "@emotion/styled";

import { lighten } from "metabase/lib/colors";

export const BreadcrumbsSeparator = styled.div`
  display: inline-block;
  color: var(--mb-color-bg-dark);
  position: relative;
  margin: 0 6px;
  top: 2px;
`;

export const BreadcrumbsLink = styled.a`
  cursor: pointer;
  color: var(--mb-color-filter);
  transition: color 200ms;

  &:hover {
    color: ${lighten("accent7", 0.2)};
  }
`;
