import styled from "styled-components";

import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const PermissionPageRoot = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
`;

export const PermissionPageContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

export const PermissionPageSidebar = styled.aside`
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  border-left: 1px solid ${color("border")};
  max-width: 300px;
`;

export const TabsContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const FullHeightContainer = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
`;

export const HelpButton = styled.button`
  font-family: var(--default-font-family);
  display: flex;
  align-items: center;
  cursor: pointer;
  color: ${color("text-dark")};
  padding: 0.25rem 1.5rem;
  font-size: 14px;
  font-weight: 700;
`;

export const CloseSidebarButton = styled(Icon).attrs({ name: "close" })`
  top: 24px;
  right: 24px;
  color: ${color("text-light")};
  position: absolute;
  cursor: pointer;
  transition: color 200ms;

  &:hover {
    color: ${color("text-medium")};
  }
`;
