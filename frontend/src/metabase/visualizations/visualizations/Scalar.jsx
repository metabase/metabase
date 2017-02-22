/* @flow */

import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import styles from "./Scalar.css";

import Ellipsified from "metabase/components/Ellipsified.jsx";

import Urls from "metabase/lib/urls";
import { formatValue } from "metabase/lib/formatting";
import { TYPE } from "metabase/lib/types";
import { isNumber } from "metabase/lib/schema_metadata";

import cx from "classnames";
import { getIn } from "icepick";
import d3 from "d3";

import type { VisualizationProps } from "metabase/visualizations";

export default class Scalar extends Component<*, VisualizationProps, *> {
    static uiName = "Number";
    static identifier = "scalar";
    static iconName = "number";

    static noHeader = true;
    static supportsSeries = true;

    static minSize = { width: 3, height: 3 };

    static isSensible(cols, rows) {
        return rows.length === 1 && cols.length === 1;
    }

    static checkRenderable(cols, rows) {
        // scalar can always be rendered, nothing needed here
    }

    static seriesAreCompatible(initialSeries, newSeries) {
        if (newSeries.data.cols && newSeries.data.cols.length === 1) {
            return true;
        }
        return false;
    }

    static transformSeries(series) {
        if (series.length > 1) {
            return series.map(s => ({
                card: {
                    ...s.card,
                    display: "funnel",
                    visualization_settings: {
                        ...s.card.visualization_settings,
                        "graph.x_axis.labels_enabled": false
                    }
                },
                data: {
                    cols: [
                        { base_type: TYPE.Text, display_name: "Name", name: "name" },
                        { ...s.data.cols[0] }],
                    rows: [
                        [s.card.name, s.data.rows[0][0]]
                    ]
                }
            }));
        } else {
            return series;
        }
    }

    static settings = {
        "scalar.locale": {
            title: "Separator style",
            widget: "select",
            props: {
                options: [
                    { name: "100000.00", value: null },
                    { name: "100,000.00", value: "en" },
                    { name: "100 000,00", value: "fr" },
                    { name: "100.000,00", value: "de" }
                ]
            },
            default: "en"
        },
        "scalar.decimals": {
            title: "Number of decimal places",
            widget: "number"
        },
        "scalar.prefix": {
            title: "Add a prefix",
            widget: "input"
        },
        "scalar.suffix": {
            title: "Add a suffix",
            widget: "input"
        },
        "scalar.scale": {
            title: "Multiply by a number",
            widget: "number"
        },
    };

    render() {
        let { card, data, className, actionButtons, gridSize, settings, linkToCard } = this.props;

        let isSmall = gridSize && gridSize.width < 4;
        const column = getIn(data, ["cols", 0]);

        let scalarValue = getIn(data, ["rows", 0, 0]);
        if (scalarValue == null) {
            scalarValue = "";
        }

        let compactScalarValue, fullScalarValue;

        // TODO: some or all of these options should be part of formatValue
        if (typeof scalarValue === "number" && isNumber(column)) {
            let number = scalarValue;

            // scale
            const scale =  parseFloat(settings["scalar.scale"]);
            if (!isNaN(scale)) {
                number *= scale;
            }

            const localeStringOptions = {};

            // decimals
            let decimals = parseFloat(settings["scalar.decimals"]);
            if (!isNaN(decimals)) {
                number = d3.round(number, decimals);
                localeStringOptions.minimumFractionDigits = decimals;
            }

            // currency
            if (settings["scalar.currency"] != null) {
                localeStringOptions.style = "currency";
                localeStringOptions.currency = settings["scalar.currency"];
            }

            try {
                // format with separators and correct number of decimals
                if (settings["scalar.locale"]) {
                    number = number.toLocaleString(settings["scalar.locale"], localeStringOptions);
                } else {
                    // HACK: no locales that don't thousands separators?
                    number = number.toLocaleString("en", localeStringOptions).replace(/,/g, "");
                }
            } catch (e) {
                console.warn("error formatting scalar", e);
            }
            fullScalarValue = formatValue(number, { column: column });
        } else {
            fullScalarValue = formatValue(scalarValue, { column: column });
        }

        compactScalarValue = isSmall ? formatValue(scalarValue, { column: column, compact: true }) : fullScalarValue

        if (settings["scalar.prefix"]) {
            compactScalarValue = settings["scalar.prefix"] + compactScalarValue;
            fullScalarValue = settings["scalar.prefix"] + fullScalarValue;
        }
        if (settings["scalar.suffix"]) {
            compactScalarValue = compactScalarValue + settings["scalar.suffix"];
            fullScalarValue = fullScalarValue + settings["scalar.suffix"];
        }

        return (
            <div className={cx(className, styles.Scalar, styles[isSmall ? "small" : "large"])}>
                <div className="Card-title absolute top right p1 px2">{actionButtons}</div>
                <Ellipsified
                    className={cx(styles.Value, 'ScalarValue', 'fullscreen-normal-text', 'fullscreen-night-text')}
                    tooltip={fullScalarValue}
                    alwaysShowTooltip={fullScalarValue !== compactScalarValue}
                    style={{maxWidth: '100%'}}
                >
                    {compactScalarValue}
                </Ellipsified>
                <Ellipsified className={styles.Title} tooltip={card.name}>
                    { linkToCard ?
                        <Link to={Urls.card(card.id)} className="no-decoration fullscreen-normal-text fullscreen-night-text">{settings["card.title"]}</Link>
                    :
                        <span className="fullscreen-normal-text fullscreen-night-text">{settings["card.title"]}</span>
                    }
                </Ellipsified>
            </div>
        );
    }
}
