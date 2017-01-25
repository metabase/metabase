/* @flow weak */

import React from "react";
import { Route } from "react-router";

import Icon from "metabase/components/Icon.jsx";

const SIZES = [12, 16, 32];

const IconsApp = () =>
    <table className="Table m4" style={{ width: "inherit" }}>
        <thead>
            <tr>
                <th>Name</th>
                {SIZES.map(size =>
                    <th>{size}px</th>
                )}
            </tr>
        </thead>
        <tbody>
        { Object.keys(require("metabase/icon_paths").ICON_PATHS).map(name =>
            <tr>
                <td>{name}</td>
                {SIZES.map(size =>
                    <td><Icon name={name} size={size} /></td>
                )}
            </tr>
        )}
        </tbody>
    </table>

// const IconsApp = () =>
//     <div className="flex flex-wrap">
//         { Object.keys(require("metabase/icon_paths").ICON_PATHS).map(name =>
//             <div className="flex flex-column layout-centered mr1 mb1 bordered rounded p2">
//                 <td><Icon name={name} className="bordered"/></td>
//                 <div>{name}</div>
//             </div>
//         )}
//     </div>

export const getRoutes = () =>
    <Route path="/_debug">
        <Route path="icons" component={IconsApp} />
    </Route>
