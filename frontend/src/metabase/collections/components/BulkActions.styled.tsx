import styled from "@emotion/styled";
import { breakpointMinSmall } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

import { SIDEBAR_WIDTH } from "metabase/collections/constants";

export const FixedBottomBar = styled.div<{ isNavbarOpen: boolean }>`
  position: fixed;
  bottom: 0;
  left: ${props => (props.isNavbarOpen ? SIDEBAR_WIDTH : 0)};
  right: 0;
  border-top: 1px solid ${color("border")};
  background-color: ${color("white")};
`;

export const ActionBarContent = styled.div`
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  width: 90%;
  margin: 0 auto;

  ${breakpointMinSmall} {
    padding-left: 2rem;
    padding-right: 2rem;
  }
`;

export const ActionBarText = styled.div`
  margin-left: auto;
`;

export const ActionControlsRoot = styled.div`
  margin-left: 0.5rem;
`;
