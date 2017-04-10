import React, { Component } from "react";
import { Route, Link } from "react-router";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

const SIZES = [12, 16];

const ListApp = () =>
    <ul>
        <li><Link to="_internal/icons">Icons</Link></li>
        <li><Link to="_internal/colors">Colors</Link></li>
    </ul>

class IconsApp extends Component {
    constructor(props) {
        super(props);
        this.state = {
            size: 32
        }
    }
    render() {
        let sizes = SIZES.concat(this.state.size)
        return (
            <table className="Table m4" style={{ width: "inherit" }}>
                <thead>
                    <tr>
                        <th>Name</th>
                        {sizes.map((size, index) =>
                            <th>
                                <div>{size}px</div>
                                { index === SIZES.length &&
                                    <input
                                        style={{ width: 60 }}
                                        type="range"
                                        value={this.state.size}
                                        max={64}
                                        onChange={(e) => this.setState({ size: e.target.value })}
                                    />
                                }
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody>
                { Object.keys(require("metabase/icon_paths").ICON_PATHS).map(name =>
                    <tr>
                        <td>{name}</td>
                        {sizes.map(size =>
                            <td><Icon name={name} size={size} /></td>
                        )}
                    </tr>
                )}
                </tbody>
            </table>
        )
    }
}

// eslint-disable-next-line import/no-commonjs
let colorStyles = require("!style!css?modules!postcss!metabase/css/core/colors.css");

const ColorsApp = () =>
    <div className="p2">
        {Object.entries(colorStyles).map(([name, className]) =>
            <div
                className={cx(className, "rounded px1")}
                style={{ paddingTop: "0.25em", paddingBottom: "0.25em", marginBottom: "0.25em" }}
            >
                {name}
            </div>
        )}
    </div>

export default (
    <Route>
        <Route path="list" component={ListApp} />
        <Route path="icons" component={IconsApp} />
        <Route path="colors" component={ColorsApp} />
    </Route>
);
