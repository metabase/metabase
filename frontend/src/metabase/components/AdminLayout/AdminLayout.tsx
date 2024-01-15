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
}

export function AdminLayout({
  sidebar,
  children,
  saveStatusRef,
}: AdminLayoutProps) {
  return (
    <AdminWrapper>
      <AdminNotifications role="status">
        <AdminSaveStatus ref={saveStatusRef} />
      </AdminNotifications>

      <AdminMain>
        <AdminSidebar>{sidebar}</AdminSidebar>
        <AdminContent>{children}</AdminContent>
      </AdminMain>
    </AdminWrapper>
  );
}
