import { Flex } from "metabase/ui";

import {
  AdminSidebar,
  AdminWrapper,
  AdminMain,
  AdminContent,
} from "./AdminLayout.styled";

interface AdminLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  upsell?: React.ReactNode;
  headerHeight?: number;
}

export function AdminLayout({
  sidebar,
  children,
  headerHeight,
  upsell,
}: AdminLayoutProps) {
  return (
    <AdminWrapper headerHeight={headerHeight}>
      <AdminMain>
        <AdminSidebar data-testid="admin-layout-sidebar">
          {sidebar}
        </AdminSidebar>
        <AdminContent data-testid="admin-layout-content">
          {upsell ? (
            <Flex justify="space-between" w="100%">
              {children}
              {upsell}
            </Flex>
          ) : (
            children
          )}
        </AdminContent>
      </AdminMain>
    </AdminWrapper>
  );
}
