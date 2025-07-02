/* eslint-disable react/prop-types */
import cx from "classnames";
import { IndexLink, Link } from "react-router";

import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";

/**
 * @deprecated use frontend/src/metabase/admin/settings/components/AdminNav instead
 */
export function LeftNavPaneItem({ name, path, index = false }) {
  const isSelected = path === window.location.pathname;
  return (
    <li data-testid="left-nav-pane-item">
      {index ? (
        <IndexLink
          to={path}
          className={cx(
            AdminS.AdminListItem,
            CS.flex,
            CS.alignCenter,
            CS.noDecoration,
            CS.justifyBetween,
          )}
          activeClassName={AdminS.selected}
          data-selected={isSelected}
        >
          {name}
        </IndexLink>
      ) : (
        <Link
          to={path}
          className={cx(
            AdminS.AdminListItem,
            CS.flex,
            CS.alignCenter,
            CS.noDecoration,
            CS.justifyBetween,
          )}
          activeClassName={AdminS.selected}
          data-selected={isSelected}
        >
          {name}
        </Link>
      )}
    </li>
  );
}

/**
 * @deprecated use frontend/src/metabase/admin/settings/components/AdminNav instead
 */
export function LeftNavPane({ children }) {
  return (
    <aside
      data-testid="admin-left-nav-pane"
      className={cx(AdminS.AdminList, CS.flexNoShrink)}
    >
      <ul className={CS.pt1} aria-label="admin-list-items">
        {children}
      </ul>
    </aside>
  );
}
