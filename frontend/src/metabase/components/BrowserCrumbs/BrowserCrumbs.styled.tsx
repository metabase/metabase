import styled from "@emotion/styled";

import { Icon } from "metabase/core/components/Icon";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";

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
    color: ${color("brand")};
  }
`;

export const BrowserCrumbsIcon = styled(Icon)`
  margin: 0 0.5rem;
  color: ${color("text-light")};
`;
