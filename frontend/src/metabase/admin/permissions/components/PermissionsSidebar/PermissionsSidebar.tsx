import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ResizableSidePanel } from "metabase/common/components/ResizableSidePanel";

import { SidebarRoot } from "./PermissionsSidebar.styled";
import type { PermissionsSidebarContentProps } from "./PermissionsSidebarContent";
import { PermissionsSidebarContent } from "./PermissionsSidebarContent";

interface PermissionsSidebarProps extends PermissionsSidebarContentProps {
  isLoading?: boolean;
  error?: string;
}

export const PermissionsSidebar = ({
  isLoading,
  error,
  ...contentProps
}: PermissionsSidebarProps) => {
  return (
    <ResizableSidePanel
      storageKey="admin-permissions-nav"
      side="left"
      defaultSize="md"
    >
      <SidebarRoot>
        <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
          <PermissionsSidebarContent {...contentProps} />
        </LoadingAndErrorWrapper>
      </SidebarRoot>
    </ResizableSidePanel>
  );
};
