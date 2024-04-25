import {
  AdminSidebar,
  AdminWrapper,
  AdminMain,
  AdminContent,
} from "./AdminLayout.styled";

interface AdminLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  headerHeight?: number;
}

export function AdminLayout({
  sidebar,
  children,
  headerHeight,
}: AdminLayoutProps) {
  return (
    <AdminWrapper headerHeight={headerHeight}>
      <AdminMain>
        <AdminSidebar data-testid="admin-layout-sidebar">
          {sidebar}
        </AdminSidebar>
        <AdminContent data-testid="admin-layout-content">
          {children}
        </AdminContent>
      </AdminMain>
    </AdminWrapper>
  );
}
