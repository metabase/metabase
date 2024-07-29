import { AdminNavLink, AdminNavListItem } from "./AdminNavItem.styled";

interface AdminNavItemProps {
  name: string;
  path: string;
  currentPath: string;
}

export const AdminNavItem = ({
  name,
  path,
  currentPath,
}: AdminNavItemProps) => (
  <AdminNavListItem path={path} currentPath={currentPath}>
    <AdminNavLink to={path} isSelected={currentPath.startsWith(path)}>
      {name}
    </AdminNavLink>
  </AdminNavListItem>
);
