import React, { Component } from "react";
import { Route } from "react-router";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

const SIZES = [12, 16];

const ListApp = () =>
    <ul>
        <li><a href="/_internal/icons">Icons</a></li>
        <li><a href="/_internal/embed?url=">Embed</a></li>
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

import Toggle from "metabase/components/Toggle";
import MetabaseEmbed from "metabase/public/components/MetabaseEmbed";
import querystring from "querystring";

class EmbedTestApp extends Component {
    constructor(props) {
        super(props);
        this.state = {
            bordered: true
        }
    }
    render() {
        const { location, params } = this.props;
        let options = querystring.stringify({ bordered: this.state.bordered });
        if (options) {
            options = "#" + options;
        }
        const url = `${window.location.origin}/public/${params.type}/${params.uuid}${location.search}${options}`;
        return (
            <div className="bg-brand flex-full px4 pb4 flex flex-column">
                <div className="p1 py2 flex align-center text-white text-bold">
                    <span className="mr1">Bordered:</span>
                    <Toggle value={this.state.bordered} onChange={value => this.setState({ bordered: value })} />
                    <input
                        className="ml2 input flex-full"
                        style={{ textAlign: "left", direction: "rtl" }}
                        value={url}
                    />
                </div>
                <MetabaseEmbed
                    className="flex-full"
                    url={url}
                />
            </div>
        );
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
        <Route path="embed/:type/:uuid" component={EmbedTestApp} />
    </Route>
);
