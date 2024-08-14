import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

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
    <SidebarRoot>
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        <PermissionsSidebarContent {...contentProps} />
      </LoadingAndErrorWrapper>
    </SidebarRoot>
  );
};
