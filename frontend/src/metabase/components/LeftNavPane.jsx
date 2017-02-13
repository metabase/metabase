import React from "react";
import { Link, IndexLink } from "react-router";

export function LeftNavPaneItem({ name, path, index = false }) {
    return (
        <li>
            { index ?
                <IndexLink to={path} className="AdminList-item flex align-center justify-between no-decoration" activeClassName="selected" >
                    {name}
                </IndexLink>
            :
                <Link to={path} className="AdminList-item flex align-center justify-between no-decoration" activeClassName="selected" >
                    {name}
                </Link>
            }
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
        <div className="MetadataEditor-table-list AdminList flex-no-shrink full-height">
            <ul className="AdminList-items pt1">
                {children}
            </ul>
        </div>
    );
}
