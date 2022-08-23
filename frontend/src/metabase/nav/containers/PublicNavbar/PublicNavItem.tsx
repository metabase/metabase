import React from "react";
import { PublicNavLink } from "./PublicNavItem.styled";

interface PublicNavItem {
  name: string;
  path: string;
  currentPath: string;
}

export const PublicNavItem = ({ name, path, currentPath }: PublicNavItem) => (
  <li>
    <PublicNavLink
      to={path}
      data-metabase-event={`NavBar;${name}`}
      isSelected={currentPath.startsWith(path)}
    >
      {name}
    </PublicNavLink>
  </li>
);
