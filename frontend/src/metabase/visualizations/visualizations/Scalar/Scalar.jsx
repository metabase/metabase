/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import ScalarValue, {
  ScalarWrapper,
  ScalarTitle,
} from "metabase/visualizations/components/ScalarValue";
import { TransformedVisualization } from "metabase/visualizations/components/TransformedVisualization";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";

import { ScalarContainer, LabelIcon } from "./Scalar.styled";
import { TITLE_ICON_SIZE } from "./constants";
import { scalarToBarTransform } from "./scalars-bar-transform";
import { getTitleLinesCount, getValueHeight, getValueWidth } from "./utils";

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
export class Scalar extends Component {
  static uiName = t`Number`;
  static identifier = "scalar";
  static iconName = "number";
  static canSavePng = false;

  static noHeader = true;
  static supportsSeries = true;

  static minSize = getMinSize("scalar");
  static defaultSize = getDefaultSize("scalar");

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
      height,
      width,
      gridSize,
      totalNumGridCols,
      fontFamily,
      rawSeries,
    } = this.props;

    if (rawSeries.length > 1) {
      return (
        <TransformedVisualization
          transformSeries={scalarToBarTransform}
          originalProps={this.props}
          VisualizationComponent={BarChart}
        />
      );
    }

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
    const isClickable = onVisualizationClick != null;

    const showSmallTitle =
      !!settings["card.title"] &&
      isDashboard &&
      (gridSize?.width < 2 || gridSize?.height < 2);

    const titleLinesCount = getTitleLinesCount(height);

    const handleClick = () => {
      if (
        this._scalar &&
        onVisualizationClick &&
        visualizationIsClickable(clicked)
      ) {
        onVisualizationClick({ ...clicked, element: this._scalar });
      }
    };

    return (
      <ScalarWrapper>
        <div
          className={cx(
            DashboardS.CardTitle,
            CS.textDefault,
            CS.textSmaller,
            CS.absolute,
            CS.top,
            CS.right,
            CS.p1,
            CS.px2,
          )}
        >
          {actionButtons}
        </div>
        <ScalarContainer
          className={cx(
            DashboardS.fullscreenNormalText,
            DashboardS.fullscreenNightText,
            EmbedFrameS.fullscreenNightText,
          )}
          data-testid="scalar-container"
          tooltip={fullScalarValue}
          alwaysShowTooltip={fullScalarValue !== displayValue}
          isClickable={isClickable}
        >
          <span onClick={handleClick} ref={scalar => (this._scalar = scalar)}>
            <ScalarValue
              fontFamily={fontFamily}
              gridSize={gridSize}
              height={getValueHeight(height, { isDashboard, showSmallTitle })}
              totalNumGridCols={totalNumGridCols}
              value={displayValue}
              width={getValueWidth(width)}
            />
          </span>
        </ScalarContainer>

        {isDashboard &&
          (showSmallTitle ? (
            <LabelIcon
              data-testid="scalar-title-icon"
              name="ellipsis"
              tooltip={settings["card.title"]}
              size={TITLE_ICON_SIZE}
            />
          ) : (
            <ScalarTitle
              lines={titleLinesCount}
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
