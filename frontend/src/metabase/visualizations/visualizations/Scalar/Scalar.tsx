import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import DashboardS from "metabase/css/dashboard.module.css";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import {
  ScalarValue,
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue/ScalarValue";
import { TransformedVisualization } from "metabase/visualizations/components/TransformedVisualization";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import type { DatasetColumn, DatasetData } from "metabase-types/api/dataset";

import { ScalarContainer } from "./Scalar.styled";
import { scalarToBarTransform } from "./scalars-bar-transform";

const PADDING = 32;

// convert legacy `scalar.*` visualization settings to format options
function legacyScalarSettingsToFormatOptions(
  settings: ComputedVisualizationSettings,
) {
  return _.chain(settings)
    .pairs()
    .filter(([key, value]) => key.startsWith("scalar.") && value !== undefined)
    .map(([key, value]) => [key.replace(/^scalar\./, ""), value])
    .object()
    .value();
}

// Scalar visualization shows a single number
// Multiseries Scalar is transformed to a Funnel
export class Scalar extends Component<
  VisualizationProps & VisualizationPassThroughProps
> {
  static getUiName = () => t`Number`;
  static identifier = "scalar";
  static iconName = "number";
  static canSavePng = false;

  static minSize = getMinSize("scalar");
  static defaultSize = getDefaultSize("scalar");

  static isSensible({ cols, rows }: DatasetData) {
    return rows.length === 1 && cols.length === 1;
  }

  static checkRenderable() {
    // scalar can always be rendered, nothing needed here
  }

  static settings = {
    ...fieldSetting("scalar.field", {
      get title() {
        return t`Field to show`;
      },
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
        _.find(cols, (col) => col.name === settings["scalar.field"]) || cols[0],
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

  _scalar: HTMLElement | null = null;

  _getColumnIndex(
    cols: DatasetColumn[],
    settings: ComputedVisualizationSettings,
  ) {
    const columnIndex = _.findIndex(
      cols,
      (col) => col.name === settings["scalar.field"],
    );
    return columnIndex < 0 ? 0 : columnIndex;
  }

  render() {
    const {
      series: [
        {
          data: { cols, rows },
        },
      ],
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
      ...settings.column?.(column),
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
      data: rows[0]?.map((value, index) => ({ value, col: cols[index] })),
      settings,
    };
    const isClickable = onVisualizationClick != null;

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
          <span onClick={handleClick} ref={(scalar) => (this._scalar = scalar)}>
            <ScalarValue
              fontFamily={fontFamily}
              gridSize={gridSize}
              height={Math.max(height - PADDING * 2, 0)}
              totalNumGridCols={totalNumGridCols}
              value={displayValue as string}
              width={Math.max(width - PADDING, 0)}
            />
          </span>
        </ScalarContainer>
      </ScalarWrapper>
    );
  }
}
