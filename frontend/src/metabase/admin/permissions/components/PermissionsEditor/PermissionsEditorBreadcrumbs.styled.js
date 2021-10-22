import styled from "styled-components";

import { color, lighten } from "metabase/lib/colors";

export const BreadcrumbsSeparator = styled.div`
  display: inline-block;
  color: ${color("bg-dark")};
  position: relative;
  margin: 0 6px;
  top: 2px;
`;

export const BreadcrumbsLink = styled.a`
  cursor: pointer;
  color: ${color("accent7")};
  transition: color 200ms;

  &:hover {
    color: ${lighten("accent7", 0.2)};
  }
`;
