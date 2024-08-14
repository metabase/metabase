import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { lighten } from "metabase/lib/colors";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";
import {
  breakpointMaxSmall,
  breakpointMinSmall,
  space,
} from "metabase/styled-components/theme";
import { Box, type BoxProps, Icon } from "metabase/ui";

import { SidebarLink } from "./SidebarItems";
import { ExpandToggleButton } from "./SidebarItems/SidebarItems.styled";

const openSidebarCSS = css`
  width: ${NAV_SIDEBAR_WIDTH};
  border-inline-end: 1px solid var(--mb-color-border);

  ${breakpointMaxSmall} {
    width: 90vw;
  }
`;

const closeSidebarCSS = css`
  opacity: 0;
`;

export const Sidebar = styled.aside<{ isOpen: boolean }>`
  width: 0;
  height: 100%;
  position: relative;
  flex-shrink: 0;
  align-items: center;
  background-color: var(--mb-color-bg-white);
  overflow: auto;
  overflow-x: hidden;
  z-index: 4;

  ${props => (props.isOpen ? openSidebarCSS : closeSidebarCSS)};

  ${breakpointMaxSmall} {
    position: absolute;
    top: 0;
    inset-inline-start: 0;
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

export const SidebarSection = styled(Box)<BoxProps>`
  margin-top: ${space(1)};
  margin-bottom: ${space(2)};
  padding-inline-start: ${space(2)};
  padding-inline-end: ${space(2)};
`;

export const TrashSidebarSection = styled(SidebarSection)`
  ${ExpandToggleButton} {
    width: 12px;
  }
`;

export const SidebarHeadingWrapper = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: ${space(1)};
`;

export const SidebarHeading = styled.h4`
  color: var(--mb-color-text-medium);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.45px;
  padding-inline-start: ${space(2)};
`;

export const CollectionsMoreIconContainer = styled.button`
  margin-inline-start: auto;
  margin-inline-end: ${space(1)};
  cursor: pointer;
`;

export const CollectionsMoreIcon = styled(Icon)`
  color: var(--mb-color-text-medium);
`;

export const CollectionMenuList = styled.ul`
  padding: 0.5rem;
`;

export const LoadingAndErrorContainer = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
`;

export const LoadingAndErrorContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--mb-color-brand);
  text-align: center;
`;

export const LoadingAndErrorTitle = styled.h2`
  color: var(--mb-color-text-light);
  font-weight: 400;
  margin-top: ${space(1)};
`;

export const PaddedSidebarLink = styled(SidebarLink)`
  padding-inline-start: 12px;
`;

export const AddYourOwnDataLink = styled(SidebarLink)`
  background: var(--mb-color-brand);
  border-radius: 8px;
  color: var(--mb-color-text-white);
  margin: ${space(1)};
  padding: 2px 6px;

  svg {
    color: var(--mb-color-brand-light);
  }

  transition: background-color 0.3s linear;

  @media (prefers-reduced-motion) {
    transition: none;
  }

  &:hover {
    background: ${() => lighten("brand", 0.12)};
    color: var(--mb-color-text-white);

    svg {
      color: var(--mb-color-brand-light) !important;
    }
  }
`;
