import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { Icon } from "metabase/core/components/Icon";
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
  background-color: ${color("white")};

  overflow: auto;
  overflow-x: hidden;
  z-index: 4;

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

export const PaddedSidebarLink = styled(SidebarLink)`
  padding-left: ${space(2)};
`;

export const AddYourOwnDataLink = styled(SidebarLink)`
  background: ${color("brand")};
  border-radius: 8px;
  color: ${color("white")};
  margin: ${space(1)};
  padding: 2px 6px;
  svg {
    color: ${color("brand-light")};
  }
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
