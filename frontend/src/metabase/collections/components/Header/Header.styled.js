import styled from "styled-components";
import { color } from "metabase/lib/colors";

import { breakpointMinSmall, spacing } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";

export const ToggleMobileSidebarIcon = styled(Icon).attrs({
  name: "burger",
  size: 20,
})`
  cursor: pointer;
  margin: 4px ${spacing[2]} 0 ${spacing[1]};

  ${breakpointMinSmall} {
    display: none;
  }
`;

export const DescriptionTooltipIcon = styled(Icon).attrs({
  name: "info",
})`
  color: ${color("bg-dark")};
  margin-left: ${spacing[1]};
  margin-top: 4px;

  &:hover {
    color: ${color("brand")};
  }
`;
