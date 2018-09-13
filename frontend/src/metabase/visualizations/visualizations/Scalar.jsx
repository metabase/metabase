/* @flow */

import React, { Component } from "react";
import styles from "./Scalar.css";
import { t } from "c-3po";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";

import { formatValue } from "metabase/lib/formatting";
import { TYPE } from "metabase/lib/types";

import { COLUMN_SETTINGS } from "metabase/visualizations/lib/settings/column";

import cx from "classnames";
import _ from "underscore";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

function getLegacyScalarSettings(settings) {
  return _.chain(settings)
    .pairs()
    .filter(([key, value]) => key.startsWith("scalar.") && value !== undefined)
    .map(([key, value]) => [key.replace(/^scalar\./, ""), value])
    .object()
    .value();
}

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
    ...COLUMN_SETTINGS,
    // LEGACY scalar settings, now handled by column level settings
    "scalar.locale": {
      // title: t`Separator style`,
      // widget: "select",
      // props: {
      //   options: [
      //     { name: "100000.00", value: null },
      //     { name: "100,000.00", value: "en" },
      //     { name: "100 000,00", value: "fr" },
      //     { name: "100.000,00", value: "de" },
      //   ],
      // },
      // default: "en",
    },
    "scalar.decimals": {
      // title: t`Number of decimal places`,
      // widget: "number",
    },
    "scalar.prefix": {
      // title: t`Add a prefix`,
      // widget: "input",
    },
    "scalar.suffix": {
      // title: t`Add a suffix`,
      // widget: "input",
    },
    "scalar.scale": {
      // title: t`Multiply by a number`,
      // widget: "number",
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

    const value = rows[0] && rows[0][0];
    const column = cols[0];

    const formatOptions = {
      ...getLegacyScalarSettings(settings),
      ...settings.column(column),
      jsx: true,
    };

    const fullScalarValue = formatValue(value, formatOptions);
    const compactScalarValue = isSmall
      ? formatValue(value, { ...formatOptions, compact: true })
      : fullScalarValue;

    const clicked = { value, column };
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
