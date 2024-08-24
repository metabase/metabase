import Loading from "metabase/components/Loading";

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
      <Loading loading={isLoading} error={error}>
        <PermissionsSidebarContent {...contentProps} />
      </Loading>
    </SidebarRoot>
  );
};
