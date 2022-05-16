import styled from "@emotion/styled";
import { css } from "@emotion/react";

import Icon from "metabase/components/Icon";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";

import { color, lighten } from "metabase/lib/colors";
import {
  breakpointMaxSmall,
  breakpointMinSmall,
  space,
} from "metabase/styled-components/theme";
import { SidebarLink } from "./SidebarItems";

const openSidebarCSS = css`
  width: ${NAV_SIDEBAR_WIDTH};

  border-right: 1px solid ${color("border")};

  ${breakpointMaxSmall} {
    width: 90vw;
  }
`;

export const Sidebar = styled.aside<{ isOpen: boolean }>`
  width: 0;
  height: 100%;

  position: relative;
  flex-shrink: 0;
  align-items: center;
  padding: 0.5rem 0;
  background-color: ${color("white")};

  overflow: auto;
  overflow-x: hidden;
  z-index: 4;

  transition: width 0.2s;

  @media (prefers-reduced-motion) {
    transition: none;
  }

  ${props => props.isOpen && openSidebarCSS};

  ${breakpointMaxSmall} {
    position: absolute;
    top: 0;
    left: 0;
  }
`;

export const NavRoot = styled.nav<{ isOpen: boolean }>`
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding-top: ${space(1)};
  height: 100%;
  background-color: transparent;

  overflow-x: hidden;
  overflow-y: auto;
  padding-bottom: 4rem;

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

export const CollectionMenuList = styled.ul`
  padding: 0.5rem;
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

export const ProfileLinkContainer = styled.div<{ isOpen: boolean }>`
  position: fixed;
  bottom: 0;
  // Height is hard-set so it remains
  // the same as the ArchiveBarContent
  // in ArchiveApp
  height: 49px;
  left: 0;
  padding: ${space(0)};
  width: ${props => (props.isOpen ? NAV_SIDEBAR_WIDTH : 0)};
  border-top: 1px solid ${color("border")};
  background-color: ${color("white")};
  display: flex;
  overflow: hidden;
  align-items: center;
  margin-right: ${space(2)};
  color: ${color("text-light")};
`;

export const HomePageLink = styled(SidebarLink)`
  padding-left: 12px;
`;

export const BrowseLink = styled(SidebarLink)`
  padding-left: 14px;
`;

export const AddYourOwnDataLink = styled(SidebarLink)`
  background: ${color("brand")};
  border-radius: 8px;
  color: ${color("white")};
  margin: ${space(1)};
  padding: 2px 6px;
  transition: background-color 0.3s linear;

  @media (prefers-reduced-motion) {
    transition: none;
  }

  &:hover {
    background: ${lighten("brand", 0.12)};
    color: ${color("white")};

    svg {
      color: ${color("brand-light")} !important;
    }
  }
`;
