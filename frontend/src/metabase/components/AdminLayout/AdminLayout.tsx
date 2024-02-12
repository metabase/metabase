import {
  AdminSaveStatus,
  AdminNotifications,
  AdminSidebar,
  AdminWrapper,
  AdminMain,
  AdminContent,
} from "./AdminLayout.styled";

interface AdminLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  saveStatusRef?: React.RefObject<any>;
  headerHeight?: number;
}

export function AdminLayout({
  sidebar,
  children,
  saveStatusRef,
  headerHeight,
}: AdminLayoutProps) {
  return (
    <AdminWrapper headerHeight={headerHeight}>
      <AdminMain>
        <AdminSidebar data-testid="admin-layout-sidebar">
          {sidebar}
        </AdminSidebar>
        <AdminContent data-testid="admin-layout-content">
          <AdminNotifications role="status">
            <AdminSaveStatus ref={saveStatusRef} />
          </AdminNotifications>
          {children}
        </AdminContent>
      </AdminMain>
    </AdminWrapper>
  );
}
