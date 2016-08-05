import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import "ace/mode-json";

import * as colors from "metabase/lib/colors";

import vg from "vega";
import vl from "vega-lite";
import i from "icepick";

export default class Vega extends Component {
    componentDidMount() {
        this.componentDidUpdate();
    }

    componentDidUpdate() {
        try {
            let element = ReactDOM.findDOMNode(this);
            let { settings } = this.props;

            let spec;
            if (settings["custom.type"] === "vega") {
                spec = JSON.parse(settings["custom.vega.definition"]);
            } else if (settings["custom.type"] === "vegalite") {
                spec = JSON.parse(settings["custom.vegalite.definition"]);
            }

            let data = this.props.series.map((s, seriesIndex) => ({
                name: "table"+seriesIndex,
                values: s.data.rows.map((row, rowIndex) => {
                    let r = {};
                    for (let fieldIndex = 0; fieldIndex < row.length; fieldIndex++) {
                        r["field"+fieldIndex] = row[fieldIndex];
                    }
                    return r;
                })
            }));

            let width = this.props.width;
            let height = this.props.height;

            let type;
            if (Array.isArray(spec.marks)) {
                type = "vega";
            } else if (typeof spec.mark === "string") {
                type = "vega-lite";
            } else {
                type = "unknown";
            }

            if (type === "vega") {
                let defaults = {
                    data: data,
                    width: width - (spec.padding ? (spec.padding.left || 0) + (spec.padding.right || 0) : 0),
                    height: height - (spec.padding ? (spec.padding.top || 0) + (spec.padding.bottom || 0) : 0)
                };
                spec = i.thaw(i.merge(defaults, spec));
            } else if (type === "vega-lite") {
                let defaults = {
                    data: data[0],
                    config: {
                        viewport: [width, height],
                        cell: {
                            width: width - 150,
                            height: height - 150
                        },
                        mark: {
                            color: Object.values(colors.normal)[0]
                        }
                    }
                };
                if (spec.encoding && spec.encoding.color) {
                    defaults = i.setIn(defaults, ["encoding", "color", "scale"], {"range": Object.values(colors.normal)});
                }
                const vlSpec = i.thaw(i.merge(defaults, spec));
                spec = vl.compile(vlSpec).spec;
            }

            vg.parse.spec(spec, (error, chart) => {
                chart({ el: element }).update();
            });
        } catch (err) {
            this.props.onRenderError(err.message || err);
        }
    }

    render() {
        return <div className={this.props.className} />;
    }
}
