import styled from "@emotion/styled";

import Icon from "metabase/components/Icon";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";

import { color } from "metabase/lib/colors";
import {
  breakpointMaxSmall,
  breakpointMinSmall,
  space,
} from "metabase/styled-components/theme";
import { SidebarLink } from "./SidebarItems";

export const Sidebar = styled.aside<{ isOpen: boolean }>`
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding-top: ${space(1)};
  height: 100%;
  background-color: transparent;

  overflow-x: hidden;
  overflow-y: auto;

  opacity: ${props => (props.isOpen ? 1 : 0)};
  transition: opacity 0.2s;

  @media (prefers-reduced-motion) {
    transition: none;
  }

  ${breakpointMinSmall} {
    width: ${NAV_SIDEBAR_WIDTH};
  }

  ${breakpointMaxSmall} {
    width: 90vw;
  }
`;

export const SidebarContentRoot = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
`;

export const SidebarSection = styled.div`
  margin-top: ${space(1)};
  margin-bottom: ${space(2)};
  padding-left: ${space(2)};
  padding-right: ${space(2)};
`;

export const SidebarHeadingWrapper = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: ${space(1)};
`;

export const SidebarHeading = styled.h4`
  color: ${color("text-medium")};
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.45px;
  padding-left: ${space(2)};
`;

export const CollectionsMoreIconContainer = styled.button`
  margin-left: auto;
  margin-right: ${space(1)};
  cursor: pointer;
`;

export const CollectionsMoreIcon = styled(Icon)`
  color: ${color("text-medium")};
`;

export const LoadingContainer = styled.div`
  color: ${color("brand")};
  text-align: center;
`;

export const LoadingTitle = styled.h2`
  color: ${color("text-light")};
  font-weight: 400;
  margin-top: ${space(1)};
`;

export const ProfileLinkContainer = styled.div`
  margin-left: auto;
  margin-right: ${space(2)};
  color: ${color("text-light")};
`;

export const BrowseLink = styled(SidebarLink)`
  padding-left: 14px;
`;
