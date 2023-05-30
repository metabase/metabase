import styled from "@emotion/styled";

import { color, darken } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Icon, { IconWrapper } from "metabase/components/Icon";
import { ExternalLink } from "metabase/core/components/ExternalLink";

export const StoreIconRoot = styled(ExternalLink)`
  margin-right: ${space(1)};
`;

export const StoreIconWrapper = styled(IconWrapper)`
  color: ${color("white")};

  &:hover {
    color: ${color("white")};
    background-color: ${darken(color("filter"))};
  }
`;

export const StoreIcon = styled(Icon)`
  margin: ${space(1)};
`;
