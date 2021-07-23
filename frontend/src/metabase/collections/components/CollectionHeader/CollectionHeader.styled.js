import styled from "styled-components";
import { color } from "metabase/lib/colors";

import { breakpointMinSmall, space } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";

export const ToggleMobileSidebarIcon = styled(Icon).attrs({
  name: "burger",
  size: 20,
})`
  cursor: pointer;
  margin: ${space(0)} ${space(2)} 0 ${space(1)};

  ${breakpointMinSmall} {
    display: none;
  }
`;

export const DescriptionTooltipIcon = styled(Icon).attrs({
  name: "info",
})`
  color: ${color("bg-dark")};
  margin-left: ${space(1)};
  margin-top: ${space(0)};

  &:hover {
    color: ${color("brand")};
  }
`;
