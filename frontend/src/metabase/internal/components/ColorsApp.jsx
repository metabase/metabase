import React from "react";

import cx from "classnames";

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

export default ColorsApp;
