import styled from "@emotion/styled";

import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Sidebar = styled.aside<{ isOpen: boolean }>`
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding-top: ${space(1)};
  width: ${NAV_SIDEBAR_WIDTH};
  background-color: transparent;

  overflow-x: hidden;
  overflow-y: auto;

  opacity: ${props => (props.isOpen ? 1 : 0)};
  transition: opacity 0.2s;

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;

export const SidebarSection = styled.li`
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
  padding-left: ${space(1)};
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
`;
