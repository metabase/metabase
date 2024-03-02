import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color, darken } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const StoreIconRoot = styled(ExternalLink)`
  margin-right: ${space(1)};
`;

export const StoreIconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  cursor: pointer;
  color: ${color("white")};
  transition: all 300ms ease-in-out;

  &:hover {
    color: ${color("white")};
    background-color: ${darken(color("filter"))};
  }

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;

export const StoreIcon = styled(Icon)`
  margin: ${space(1)};
`;
