import styled from "@emotion/styled";
import { Flex } from "theme-ui";

import { color } from "metabase/lib/colors";
import { breakpointMinSmall, space } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";

export const Container = styled(Flex)`
  justify-content: space-between;
  flex-direction: column;
  margin-bottom: ${space(3)};
  padding-top: ${space(0)};

  ${breakpointMinSmall} {
    align-items: center;
    flex-direction: row;
    padding-top: ${space(3)};
  }
`;

export const MenuContainer = styled(Flex)`
  margin-top: ${space(1)};
`;

export const ToggleMobileSidebarIcon = styled(Icon)`
  cursor: pointer;
  margin: ${space(0)} ${space(2)} 0 ${space(1)};

  ${breakpointMinSmall} {
    display: none;
  }
`;

ToggleMobileSidebarIcon.defaultProps = {
  name: "burger",
  size: 20,
};

export const DescriptionTooltipIcon = styled(Icon)`
  color: ${color("bg-dark")};
  margin-left: ${space(1)};
  margin-right: ${space(1)};
  margin-top: ${space(0)};

  &:hover {
    color: ${color("brand")};
  }
`;

DescriptionTooltipIcon.defaultProps = {
  name: "info",
};
