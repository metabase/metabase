/* eslint-disable react/prop-types */
import { Link, IndexLink } from "react-router";
import { t } from "ttag";

export function LeftNavPaneItem({ name, path, index = false }) {
  return (
    <li>
      {index ? (
        <IndexLink
          to={path}
          className="AdminList-item flex align-center justify-between no-decoration"
          activeClassName="selected"
        >
          {name}
        </IndexLink>
      ) : (
        <Link
          to={path}
          className="AdminList-item flex align-center justify-between no-decoration"
          activeClassName="selected"
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
        className="AdminList-item flex align-center justify-between no-decoration link text-bold"
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
      className="MetadataEditor-table-list AdminList flex-no-shrink"
    >
      <ul className="AdminList-items pt1" aria-label="admin-list-items">
        {children}
      </ul>
    </aside>
  );
}
