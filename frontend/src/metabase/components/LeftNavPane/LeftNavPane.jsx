/* eslint-disable react/prop-types */
import { IndexLink } from "react-router";
import { Link } from "react-router-dom";
import { t } from "ttag";
import cx from "classnames";

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

export function LeftNavPane({ children, fullHeight = true }) {
  return (
    <div
      className={cx("MetadataEditor-table-list AdminList flex-no-shrink", {
        "full-height": fullHeight,
      })}
    >
      <ul className="AdminList-items pt1" aria-label="admin-list-items">
        {children}
      </ul>
    </div>
  );
}
