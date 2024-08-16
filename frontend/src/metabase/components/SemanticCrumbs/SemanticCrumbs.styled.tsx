import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { Icon } from "metabase/ui";

export const BrowserCrumbsRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const BrowserCrumbsItem = styled.div`
  display: flex;
  align-items: center;
`;

export const SemanticCrumbsLink = styled(Link)`
  cursor: pointer;

  &:hover {
    color: #509EE3 !important;
  }
`;

export const BrowserCrumbsIcon = styled(Icon)`
  margin: 0 0.5rem;
  color: var(--mb-color-text-light);
`;

export const StyledCrumb = styled.h5`
font-weight: 900;
text-transform: uppercase;
font-size: .7rem;
color: #949AAB; 

&:hover {
  color: #509EE3;
}
`;