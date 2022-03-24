import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const AppContentContainer = styled.div<{ isAdminApp: boolean }>`
  display: flex;
  position: relative;
  height: calc(100vh - 60px);
  overflow: hidden;
`;

export const AppContent = styled.div`
  width: 100%;
  overflow: auto;
  background-color: ${color("bg-white")};
`;

export const AppBar = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  position: relative;
  padding-left: 1rem;
  padding-right: 1rem;

  background-color: ${color("bg-white")};
  border-bottom: 1px solid ${color("border")};

  z-index: 4;
`;

export const LogoIconWrapper = styled.div`
  cursor: pointer;
  height: 60px;
  width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${props =>
    props.sidebarOpen ? color("bg-medium") : "transparent"};
  &:hover {
    background-color: ${color("bg-medium")};
  }
`;
