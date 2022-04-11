import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";
import styled from "@emotion/styled";

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

export const CloseSidebarButton = styled(Icon)`
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

CloseSidebarButton.defaultProps = { name: "close" };

export const ToolbarButtonsContainer = styled.div`
  display: flex;
  flex-direction: row;
  padding: 0 1rem;
`;
