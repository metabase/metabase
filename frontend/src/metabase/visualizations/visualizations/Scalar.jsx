/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { t } from "ttag";

import _ from "underscore";

import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";

import ScalarValue, {
  ScalarWrapper,
  ScalarTitle,
} from "metabase/visualizations/components/ScalarValue";
import { TYPE } from "metabase-lib/types/constants";
import { ScalarContainer, LabelIcon } from "./Scalar.styled";

// convert legacy `scalar.*` visualization settings to format options
function legacyScalarSettingsToFormatOptions(settings) {
  return _.chain(settings)
    .pairs()
    .filter(([key, value]) => key.startsWith("scalar.") && value !== undefined)
    .map(([key, value]) => [key.replace(/^scalar\./, ""), value])
    .object()
    .value();
}

// Scalar visualization shows a single number
// Multiseries Scalar is transformed to a Funnel
export default class Scalar extends Component {
  static uiName = t`Number`;
  static identifier = "scalar";
  static iconName = "number";
  static canSavePng = false;

  static noHeader = true;
  static supportsSeries = true;

  static minSize = { width: 1, height: 1 };
  static defaultSize = { width: 3, height: 3 };

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

    const { displayValue, fullScalarValue } = compactifyValue(
      value,
      width,
      formatOptions,
    );

    const clicked = {
      value,
      column,
      data: rows[0].map((value, index) => ({ value, col: cols[index] })),
      settings,
    };
    const isClickable = visualizationIsClickable(clicked);

    const showSmallTitle =
      !!settings["card.title"] &&
      isDashboard &&
      (gridSize?.width < 2 || gridSize?.height < 2);

    return (
      <ScalarWrapper>
        <div className="Card-title absolute top right p1 px2">
          {actionButtons}
        </div>
        <ScalarContainer
          className="fullscreen-normal-text fullscreen-night-text"
          tooltip={fullScalarValue}
          alwaysShowTooltip={fullScalarValue !== displayValue}
          isClickable={isClickable}
        >
          <span
            onClick={
              isClickable
                ? () =>
                    this._scalar &&
                    onVisualizationClick({ ...clicked, element: this._scalar })
                : undefined
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
        </ScalarContainer>

        {isDashboard &&
          (showSmallTitle ? (
            <LabelIcon
              name="ellipsis"
              tooltip={settings["card.title"]}
              size={10}
            />
          ) : (
            <ScalarTitle
              title={settings["card.title"]}
              description={settings["card.description"]}
              onClick={
                onChangeCardAndRun
                  ? () => onChangeCardAndRun({ nextCard: card })
                  : undefined
              }
            />
          ))}
      </ScalarWrapper>
    );
  }
}
