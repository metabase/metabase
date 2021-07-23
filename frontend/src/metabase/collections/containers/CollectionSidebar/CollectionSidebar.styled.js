import styled from "styled-components";
import { Box } from "grid-styled";

import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { breakpointMinSmall } from "metabase/styled-components/theme/media-queries";

import { SIDEBAR_WIDTH } from "metabase/collections/constants";

export const LoadingContainer = styled.div`
  color: ${color("brand")};
  text-align: center;
`;

export const LoadingTitle = styled.h2`
  color: ${color("text-light")};
  font-weight: 400;
  margin-top: ${space(1)};
`;

export const Sidebar = styled(Box.withComponent("aside"))`
  bottom: 0;
  display: flex;
  flex-direction: column;
  left: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-top: ${space(3)};
  position: fixed;
  top: 65px;
  width: ${props => (props.shouldDisplayMobileSidebar ? "100vw" : 0)};

  ${breakpointMinSmall} {
    width: ${SIDEBAR_WIDTH};
  }
`;

export const ToggleMobileSidebarIcon = styled(Icon).attrs({
  name: "close",
  size: 20,
})`
  color: ${color("brand")};
  margin: ${space(0)} ${space(2)} 0 ${space(3)}};

  ${breakpointMinSmall} {
    cursor: pointer;
    display: none;
  }
`;
