import styled from "styled-components";
import { color, darken } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Icon, { IconWrapper } from "metabase/components/Icon";

export const StoreIconRoot = styled(IconWrapper)`
  color: ${color("white")};
  margin-right: ${space(1)};

  &:hover {
    color: ${color("white")};
    background-color: ${darken(color("accent7"))};
  }
`;

export const StoreIcon = styled(Icon)`
  margin: ${space(1)};
`;
