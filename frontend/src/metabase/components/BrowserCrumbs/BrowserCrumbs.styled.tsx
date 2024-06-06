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

export const BrowserCrumbsLink = styled(Link)`
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const BrowserCrumbsIcon = styled(Icon)`
  margin: 0 0.5rem;
  color: var(--mb-color-text-light);
`;
