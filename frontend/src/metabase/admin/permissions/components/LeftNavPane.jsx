import React from "react";
import { Link } from "react-router";

import cx from 'classnames';

export function LeftNavPaneItem({ name, path, selected }) {
    return (
        <li>
            <Link to={path}
                  className={cx("AdminList-item flex align-center justify-between no-decoration", { selected: selected })} >
                {name}
            </Link>
        </li>
    );
}

export function LeftNavPaneItemBack({ path }) {
    return (
        <li>
            <Link to={path} className="AdminList-item flex align-center justify-between no-decoration link text-bold">
                &lt; Back
            </Link>
        </li>
    );
}

export function LeftNavPane({ children }) {
    return (
        <div className="MetadataEditor-main flex flex-row flex-full mt2">
            <div className="MetadataEditor-table-list AdminList flex-no-shrink full-height">
                <ul className="AdminList-items pt1">
                    {children}
                </ul>
            </div>
        </div>
    );
}
