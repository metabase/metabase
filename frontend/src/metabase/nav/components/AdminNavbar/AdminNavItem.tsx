import React from "react";
import cx from "classnames";
import Link from "metabase/components/Link";

interface AdminNavItem {
  name: string;
  path: string;
  currentPath: string;
}

export const AdminNavItem = ({ name, path, currentPath }: AdminNavItem) => (
  <li>
    <Link
      to={path}
      data-metabase-event={`NavBar;${name}`}
      className={cx("NavItem py1 px2 no-decoration", {
        "is--selected": currentPath.startsWith(path),
      })}
    >
      {name}
    </Link>
  </li>
);
