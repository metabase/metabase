/* eslint-disable react/prop-types */
import cx from "classnames";
import { Link, IndexLink } from "react-router";
import { t } from "ttag";

import AdminS from "metabase/css/admin.module.css";

export function LeftNavPaneItem({ name, path, index = false }) {
  return (
    <li>
      {index ? (
        <IndexLink
          to={path}
          className={cx(
            AdminS.AdminListItem,
            "flex align-center justify-between no-decoration",
          )}
          activeClassName={AdminS.selected}
        >
          {name}
        </IndexLink>
      ) : (
        <Link
          to={path}
          className={cx(
            AdminS.AdminListItem,
            "flex align-center justify-between no-decoration",
          )}
          activeClassName={AdminS.selected}
        >
          {name}
        </Link>
      )}
    </li>
  );
}

export function LeftNavPaneItemBack({ path }) {
  return (
    <li>
      <Link
        to={path}
        className={cx(
          AdminS.AdminListItem,
          "flex align-center justify-between no-decoration link text-bold",
        )}
      >
        &lt; {t`Back`}
      </Link>
    </li>
  );
}

export function LeftNavPane({ children }) {
  return (
    <aside
      data-testid="admin-left-nav-pane"
      className={cx(AdminS.AdminList, "flex-no-shrink")}
    >
      <ul
        className="AdminList-items pt1"
        data-testid="admin-list-items"
        aria-label="admin-list-items"
      >
        {children}
      </ul>
    </aside>
  );
}
