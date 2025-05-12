/* eslint-disable react/prop-types */
import cx from "classnames";
import { IndexLink, Link } from "react-router";
import { t } from "ttag";

import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Text } from "metabase/ui";

export function LeftNavPaneSectionTitle(props) {
  return (
    <Text
      component="li"
      fw="bold"
      c="text-secondary"
      p="0.75em 1em"
      {...props}
    />
  );
}

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

export function LeftNavPaneItemBack({ path }) {
  return (
    <li>
      <Link
        to={path}
        className={cx(
          AdminS.AdminListItem,
          CS.flex,
          CS.alignCenter,
          CS.textBold,
          CS.justifyBetween,
          CS.link,
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
      className={cx(AdminS.AdminList, CS.flexNoShrink)}
    >
      <ul className={CS.pt1} aria-label="admin-list-items">
        {children}
      </ul>
    </aside>
  );
}
