import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import styles from "./Scalar.css";

import Ellipsified from "metabase/components/Ellipsified.jsx";

import Urls from "metabase/lib/urls";
import { formatValue } from "metabase/lib/formatting";
import { TYPE } from "metabase/lib/types";
import { isNumber } from "metabase/lib/schema_metadata";

import cx from "classnames";
import i from "icepick";
import d3 from "d3";

export default class Scalar extends Component {
    static displayName = "Number";
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
                card: { ...s.card, display: "funnel" },
                data: {
                    cols: [
                        { base_type: TYPE.Text, display_name: "Name", name: "dimension" },
                        { ...s.data.cols[0], display_name: "Value", name: "metric" }],
                    rows: [
                        [s.card.name, s.data.rows[0][0]]
                    ]
                }
            }));
        } else {
            return series;
        }
    }

    render() {
        let { card, data, className, actionButtons, gridSize, settings } = this.props;

        let isSmall = gridSize && gridSize.width < 4;
        const column = i.getIn(data, ["cols", 0]);

        let scalarValue = i.getIn(data, ["rows", 0, 0]);
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
                <Ellipsified className={cx(styles.Value, 'ScalarValue', 'fullscreen-normal-text', 'fullscreen-night-text')} tooltip={fullScalarValue} alwaysShowTooltip={fullScalarValue !== compactScalarValue}>
                    {compactScalarValue}
                </Ellipsified>
                <Ellipsified className={styles.Title} tooltip={card.name}>
                    <Link to={Urls.card(card.id)} className="no-decoration fullscreen-normal-text fullscreen-night-text">{settings["card.title"]}</Link>
                </Ellipsified>
            </div>
        );
    }
}
