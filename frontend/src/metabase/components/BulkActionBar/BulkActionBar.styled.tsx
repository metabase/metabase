import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";

export const FixedBottomBar = styled.div<{ isNavbarOpen: boolean }>`
  position: fixed;
  bottom: 0;
  left: ${props => (props.isNavbarOpen ? NAV_SIDEBAR_WIDTH : 0)};
  right: 0;
  border-top: 1px solid ${color("border")};
  background-color: ${color("white")};
`;
