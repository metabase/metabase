/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { t } from "ttag";

import Ellipsified from "metabase/core/components/Ellipsified";

import { formatValue } from "metabase/lib/formatting";
import { TYPE } from "metabase/lib/types";

import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import cx from "classnames";
import _ from "underscore";

import ScalarValue, {
  ScalarWrapper,
  ScalarTitle,
} from "metabase/visualizations/components/ScalarValue";

// convert legacy `scalar.*` visualization settings to format options
function legacyScalarSettingsToFormatOptions(settings) {
  return _.chain(settings)
    .pairs()
    .filter(([key, value]) => key.startsWith("scalar.") && value !== undefined)
    .map(([key, value]) => [key.replace(/^scalar\./, ""), value])
    .object()
    .value();
}

// used below to determine whether we show compact formatting
const COMPACT_MAX_WIDTH = 250;
const COMPACT_WIDTH_PER_DIGIT = 25;
const COMPACT_MIN_LENGTH = 6;

// Scalar visualization shows a single number
// Multiseries Scalar is transformed to a Funnel
export default class Scalar extends Component {
  static uiName = t`Number`;
  static identifier = "scalar";
  static iconName = "number";

  static noHeader = true;
  static supportsSeries = true;

  static minSize = { width: 3, height: 3 };

  static isSensible({ cols, rows }) {
    return rows.length === 1 && cols.length === 1;
  }

  static checkRenderable([
    {
      data: { cols, rows },
    },
  ]) {
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
            {
              base_type: TYPE.Text,
              display_name: t`Name`,
              name: "name",
              source: "query-transform",
            },
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
    ...fieldSetting("scalar.field", {
      title: t`Field to show`,
      getDefault: ([
        {
          data: { cols },
        },
      ]) => cols[0].name,
      getHidden: ([
        {
          data: { cols },
        },
      ]) => cols.length < 2,
    }),
    ...columnSettings({
      getColumns: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => [
        _.find(cols, col => col.name === settings["scalar.field"]) || cols[0],
      ],
      readDependencies: ["scalar.field"],
    }),
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
    click_behavior: {},
  };

  _getColumnIndex(cols, settings) {
    const columnIndex = _.findIndex(
      cols,
      col => col.name === settings["scalar.field"],
    );
    return columnIndex < 0 ? 0 : columnIndex;
  }

  render() {
    const {
      actionButtons,
      series: [
        {
          card,
          data: { cols, rows },
        },
      ],
      isDashboard,
      onChangeCardAndRun,
      settings,
      visualizationIsClickable,
      onVisualizationClick,
      width,
      gridSize,
      totalNumGridCols,
      fontFamily,
    } = this.props;

    const columnIndex = this._getColumnIndex(cols, settings);
    const value = rows[0] && rows[0][columnIndex];
    const column = cols[columnIndex];

    const formatOptions = {
      ...legacyScalarSettingsToFormatOptions(settings),
      ...settings.column(column),
      jsx: true,
    };

    const fullScalarValue = formatValue(value, formatOptions);
    const compactScalarValue = formatValue(value, {
      ...formatOptions,
      compact: true,
    });

    // use the compact version of formatting if the component is narrower than
    // the cutoff and the formatted value is longer than the cutoff
    // also if the width is less than a certain multiplier of the number of digits
    const displayCompact =
      fullScalarValue !== null &&
      fullScalarValue.length > COMPACT_MIN_LENGTH &&
      (width < COMPACT_MAX_WIDTH ||
        width < COMPACT_WIDTH_PER_DIGIT * fullScalarValue.length);
    const displayValue = displayCompact ? compactScalarValue : fullScalarValue;

    const clicked = {
      value,
      column,
      data: rows[0].map((value, index) => ({ value, col: cols[index] })),
      settings,
    };
    const isClickable = visualizationIsClickable(clicked);

    return (
      <ScalarWrapper>
        <div className="Card-title absolute top right p1 px2">
          {actionButtons}
        </div>
        <Ellipsified
          className={cx("fullscreen-normal-text fullscreen-night-text", {
            "text-brand-hover cursor-pointer": isClickable,
          })}
          tooltip={fullScalarValue}
          alwaysShowTooltip={fullScalarValue !== displayValue}
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
            <ScalarValue
              value={displayValue}
              width={width}
              gridSize={gridSize}
              totalNumGridCols={totalNumGridCols}
              fontFamily={fontFamily}
            />
          </span>
        </Ellipsified>
        {isDashboard && (
          <ScalarTitle
            title={settings["card.title"]}
            description={settings["card.description"]}
            onClick={
              onChangeCardAndRun &&
              (() => onChangeCardAndRun({ nextCard: card }))
            }
          />
        )}
      </ScalarWrapper>
    );
  }
}
