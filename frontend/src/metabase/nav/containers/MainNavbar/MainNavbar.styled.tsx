import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Sidebar = styled.aside`
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding-top: ${space(1)};
  width: 100%;

  overflow-x: hidden;
  overflow-y: auto;

  background-color: transparent;
`;

export const SidebarHeading = styled.h4`
  color: ${color("text-medium")};
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.45px;
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
