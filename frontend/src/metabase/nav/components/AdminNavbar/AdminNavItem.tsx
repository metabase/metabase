import React from "react";
import { mixpanel } from "metabase/plugins/mixpanel";
import { AdminNavLink, ExternalNavLink } from "./AdminNavItem.styled";

interface AdminNavItemProps {
  name: string;
  path: string;
  currentPath: string;
  id: string;
}

export const AdminNavItem = ({
  name,
  path,
  currentPath,
  id,
}: AdminNavItemProps) => {
  if (id === "people") {
    return (
      <li>
        <a
          onClick={() => mixpanel.trackEvent(mixpanel.events.access_people)}
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
