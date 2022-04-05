import styled from "@emotion/styled";

import EntityMenu from "metabase/components/EntityMenu";
import Link from "metabase/core/components/Link";

import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const Menu = styled(EntityMenu)`
  margin-right: 0.5rem;

  ${breakpointMaxSmall} {
    display: none;
  }
`;

export const ButtonLink = styled(Link)`
  display: flex;
  align-items: center;
  margin-right: 0.5rem;
  padding: 0.5rem;
`;

export const Title = styled.h4`
  margin-left: 0.5rem;
  white-space: nowrap;

  ${breakpointMaxSmall} {
    display: none;
  }
`;
