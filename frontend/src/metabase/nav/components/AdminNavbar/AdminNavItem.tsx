import cx from "classnames";

import { Link } from "metabase/common/components/Link";

import S from "./AdminNavItem.module.css";

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
  <li
    className={cx(S.navListItem, {
      [S.navListItemActive]: currentPath.startsWith(path),
    })}
  >
    <Link
      to={path}
      className={cx(S.navLink, S.navLinkOverflowHidden, {
        [S.selected]: currentPath.startsWith(path),
      })}
    >
      {name}
    </Link>
  </li>
);
