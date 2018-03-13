/* @flow */

import React, { Component } from "react";
import styles from "./Scalar.css";
import { t } from "c-3po";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";

import { formatValue } from "metabase/lib/formatting";
import { TYPE } from "metabase/lib/types";
import { isNumber } from "metabase/lib/schema_metadata";

import cx from "classnames";
import d3 from "d3";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

export default class Scalar extends Component {
  props: VisualizationProps;

  static uiName = t`Number`;
  static identifier = "scalar";
  static iconName = "number";

  static noHeader = true;
  static supportsSeries = true;

  static minSize = { width: 3, height: 3 };

  _scalar: ?HTMLElement;

  static isSensible(cols, rows) {
    return rows.length === 1 && cols.length === 1;
  }

  static checkRenderable([{ data: { cols, rows } }]) {
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
      return series.map((s, seriesIndex) => ({
        card: {
          ...s.card,
          display: "funnel",
          visualization_settings: {
            ...s.card.visualization_settings,
            "graph.x_axis.labels_enabled": false,
          },
          _seriesIndex: seriesIndex,
        },
        data: {
          cols: [
            { base_type: TYPE.Text, display_name: t`Name`, name: "name" },
            { ...s.data.cols[0] },
          ],
          rows: [[s.card.name, s.data.rows[0][0]]],
        },
      }));
    } else {
      return series;
    }
  }

  static settings = {
    "scalar.locale": {
      title: t`Separator style`,
      widget: "select",
      props: {
        options: [
          { name: "100000.00", value: null },
          { name: "100,000.00", value: "en" },
          { name: "100 000,00", value: "fr" },
          { name: "100.000,00", value: "de" },
        ],
      },
      default: "en",
    },
    "scalar.decimals": {
      title: t`Number of decimal places`,
      widget: "number",
    },
    "scalar.prefix": {
      title: t`Add a prefix`,
      widget: "input",
    },
    "scalar.suffix": {
      title: t`Add a suffix`,
      widget: "input",
    },
    "scalar.scale": {
      title: t`Multiply by a number`,
      widget: "number",
    },
  };

  render() {
    let {
      series: [{ card, data: { cols, rows } }],
      className,
      actionButtons,
      gridSize,
      settings,
      onChangeCardAndRun,
      visualizationIsClickable,
      onVisualizationClick,
    } = this.props;
    let description = settings["card.description"];

    let isSmall = gridSize && gridSize.width < 4;
    const column = cols[0];

    let scalarValue = rows[0] && rows[0][0];
    if (scalarValue == null) {
      scalarValue = "";
    }

    let compactScalarValue, fullScalarValue;

    // TODO: some or all of these options should be part of formatValue
    if (typeof scalarValue === "number" && isNumber(column)) {
      // scale
      const scale = parseFloat(settings["scalar.scale"]);
      if (!isNaN(scale)) {
        scalarValue *= scale;
      }

      const localeStringOptions = {};

      // decimals
      let decimals = parseFloat(settings["scalar.decimals"]);
      if (!isNaN(decimals)) {
        scalarValue = d3.round(scalarValue, decimals);
        localeStringOptions.minimumFractionDigits = decimals;
      }

      let number = scalarValue;

      // currency
      if (settings["scalar.currency"] != null) {
        localeStringOptions.style = "currency";
        localeStringOptions.currency = settings["scalar.currency"];
      }

      try {
        // format with separators and correct number of decimals
        if (settings["scalar.locale"]) {
          number = number.toLocaleString(
            settings["scalar.locale"],
            localeStringOptions,
          );
        } else {
          // HACK: no locales that don't thousands separators?
          number = number
            .toLocaleString("en", localeStringOptions)
            .replace(/,/g, "");
        }
      } catch (e) {
        console.warn("error formatting scalar", e);
      }
      fullScalarValue = formatValue(number, { column: column });
    } else {
      fullScalarValue = formatValue(scalarValue, { column: column });
    }

    compactScalarValue = isSmall
      ? formatValue(scalarValue, { column: column, compact: true })
      : fullScalarValue;

    if (settings["scalar.prefix"]) {
      compactScalarValue = settings["scalar.prefix"] + compactScalarValue;
      fullScalarValue = settings["scalar.prefix"] + fullScalarValue;
    }
    if (settings["scalar.suffix"]) {
      compactScalarValue = compactScalarValue + settings["scalar.suffix"];
      fullScalarValue = fullScalarValue + settings["scalar.suffix"];
    }

    const clicked = {
      value: rows[0] && rows[0][0],
      column: cols[0],
    };
    const isClickable = visualizationIsClickable(clicked);

    return (
      <div
        className={cx(
          className,
          styles.Scalar,
          styles[isSmall ? "small" : "large"],
        )}
      >
        <div className="Card-title absolute top right p1 px2">
          {actionButtons}
        </div>
        <Ellipsified
          className={cx(
            styles.Value,
            "ScalarValue text-dark fullscreen-normal-text fullscreen-night-text",
            {
              "text-brand-hover cursor-pointer": isClickable,
            },
          )}
          tooltip={fullScalarValue}
          alwaysShowTooltip={fullScalarValue !== compactScalarValue}
          style={{ maxWidth: "100%" }}
        >
          <span
            onClick={
              isClickable &&
              (() =>
                this._scalar &&
                onVisualizationClick({ ...clicked, element: this._scalar }))
            }
            ref={scalar => (this._scalar = scalar)}
          >
            {compactScalarValue}
          </span>
        </Ellipsified>
        {this.props.isDashboard && (
          <div className={styles.Title + " flex align-center relative"}>
            <Ellipsified tooltip={card.name}>
              <span
                onClick={
                  onChangeCardAndRun &&
                  (() => onChangeCardAndRun({ nextCard: card }))
                }
                className={cx("fullscreen-normal-text fullscreen-night-text", {
                  "cursor-pointer": !!onChangeCardAndRun,
                })}
              >
                <span className="Scalar-title">{settings["card.title"]}</span>
              </span>
            </Ellipsified>
            {description && (
              <div
                className="absolute top bottom hover-child flex align-center justify-center"
                style={{ right: -20, top: 2 }}
              >
                <Tooltip tooltip={description} maxWidth={"22em"}>
                  <Icon name="infooutlined" />
                </Tooltip>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}
