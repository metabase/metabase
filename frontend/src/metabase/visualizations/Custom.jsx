import React, { Component, PropTypes } from "react";

import External from "./External.jsx";
import Vega from "./Vega.jsx";
import JavaScriptChart from "./JavaScriptChart.jsx";

import { ChartSettingsError } from "./lib/errors";

export default class Custom extends Component {
    static displayName = "Custom";
    static identifier = "custom";
    static iconName = "gear";

    static noHeader = true;
    static supportsSeries = true;

    static isSensible(cols, rows) {
        return true;
    }

    static checkRenderable(cols, rows, settings) {
        if (!settings["custom.type"]) {
            throw new ChartSettingsError("Please configure the chart in chart settings.");
        }
    }

    render() {
        const { settings } = this.props;
        if (settings["custom.type"] === "external") {
            return <External {...this.props} />;
        } else if (settings["custom.type"].startsWith("vega")) {
            return <Vega {...this.props} />;
        } else if (["d3", "dc", "react"].indexOf(settings["custom.type"]) >= 0) {
            return <JavaScriptChart {...this.props} definition={settings["custom." + settings["custom.type"] + ".definition"]} />
        } else {
            return <div>Not implemented: {settings["custom.type"]}</div>;
        }
    }
}
