import React from "react";
import cx from "classnames";
import { AdminNavLink, ExternalNavLink } from "./AdminNavItem.styled";

interface AdminNavItem {
  name: string;
  path: string;
  currentPath: string;
  id: string;
}

export const AdminNavItem = ({ name, path, currentPath, id }: AdminNavItem) => {
  console.log(id);
  if (id === "people") {
    return (
      <li>
        <a
          rel="noreferrer"
          target="_blank"
          href="https://app.dadosfera.ai/settings/access-management?from=metabase"
        >
          <ExternalNavLink>{name}</ExternalNavLink>
        </a>
      </li>
    );
  }

  return (
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
};
