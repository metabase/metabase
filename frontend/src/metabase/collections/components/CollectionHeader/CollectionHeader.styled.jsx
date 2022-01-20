import styled from "styled-components";
import { Flex } from "grid-styled";

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
  align-self: start;
`;

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
  margin-right: ${space(1)};
  margin-top: ${space(0)};

  &:hover {
    color: ${color("brand")};
  }
`;

export const DescriptionHeading = styled.div`
  font-size: 1.15rem;
  line-height: 1.7rem;
  padding-top: 1.15rem;
  max-width: 400px;
`;
