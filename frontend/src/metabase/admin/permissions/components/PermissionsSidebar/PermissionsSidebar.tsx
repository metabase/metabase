import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import type { PermissionsSidebarContentProps } from "./PermissionsSidebarContent";
import { PermissionsSidebarContent } from "./PermissionsSidebarContent";
import { SidebarRoot } from "./PermissionsSidebar.styled";

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
