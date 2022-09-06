import React from "react";
import cx from "classnames";
import Link from "metabase/core/components/Link";
import { AdminNavLink } from "./AdminNavItem.styled";

interface AdminNavItem {
  name: string;
  path: string;
  currentPath: string;
}

export const AdminNavItem = ({ name, path, currentPath }: AdminNavItem) => (
  <li>
    <AdminNavLink
      to={path}
      data-metabase-event={`NavBar;${name}`}
      isSelected={currentPath.startsWith(path)}
    >
      {name}
    </AdminNavLink>
  </li>
);
