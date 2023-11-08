import styled from "styled-components";
import { color, darken } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Icon, { IconWrapper } from "metabase/components/Icon";
import ExternalLink from "metabase/components/ExternalLink";

export const StoreIconRoot = styled(ExternalLink)`
  margin-right: ${space(1)};
`;

export const StoreIconWrapper = styled(IconWrapper)`
  color: ${color("white")};

  &:hover {
    color: ${color("white")};
    background-color: ${darken(color("accent7"))};
  }
`;

export const StoreIcon = styled(Icon).attrs({
  name: "store",
  size: 18,
})`
  margin: ${space(1)};
`;
