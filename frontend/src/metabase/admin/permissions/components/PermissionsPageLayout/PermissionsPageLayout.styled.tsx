// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { forwardRef } from "react";

import { Icon, type IconProps } from "metabase/ui";

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
  border-left: 1px solid var(--mb-color-border);
  max-width: 320px;
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

export const CloseSidebarButton = styled(
  forwardRef<SVGSVGElement, IconProps>(function CloseSidebarButton(props, ref) {
    return <Icon {...props} name={props.name ?? "close"} ref={ref} />;
  }),
)`
  top: 1.75rem;
  right: 1.5rem;
  color: var(--mb-color-text-tertiary);
  position: absolute;
  cursor: pointer;
  transition: color 200ms;

  &:hover {
    color: var(--mb-color-text-secondary);
  }
`;

export const ToolbarButtonsContainer = styled.div`
  display: flex;
  flex-direction: row;
  padding: 0 1rem;
`;
