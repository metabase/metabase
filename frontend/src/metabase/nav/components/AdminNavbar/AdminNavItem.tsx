import { AdminNavLink } from "./AdminNavItem.styled";

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
  <li>
    <AdminNavLink to={path} isSelected={currentPath.startsWith(path)}>
      {name}
    </AdminNavLink>
  </li>
);
