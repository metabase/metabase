import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Tooltip } from "metabase/ui";
import {
  ScalarValue,
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue/ScalarValue";
import { TransformedVisualization } from "metabase/visualizations/components/TransformedVisualization";
import { ChartSettingSegmentsEditor } from "metabase/visualizations/components/settings/ChartSettingSegmentsEditor";
import {
  compactifyValue,
  getColor,
  getTooltipContent,
} from "metabase/visualizations/lib/scalar_utils";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { segmentIsValid } from "metabase/visualizations/lib/utils";
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
import type { DatasetData } from "metabase-types/api";
import type { DatasetColumn } from "metabase-types/api/dataset";

import { ScalarValueContainer } from "./ScalarValueContainer";
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

  static getSensibility = (data: DatasetData) => {
    const { cols, rows } = data;
    const isScalar = rows.length === 1 && cols.length === 1;
    const hasAggregation = cols.some(
      (col) => col.source === "aggregation" || col.source === "native",
    );

    if (isScalar) {
      return "recommended" as const;
    }
    if (!hasAggregation && cols.length === 1) {
      return "sensible" as const;
    }
    return "nonsensible" as const;
  };

  static checkRenderable() {
    // scalar can always be rendered, nothing needed here
  }

  static settings = {
    ...fieldSetting("scalar.field", {
      get section() {
        return t`Formatting`;
      },
      get title() {
        return t`Field to show`;
      },
      getDefault: ([
        {
          data: { cols },
        },
      ]) => cols[0]?.name,
      getHidden: ([
        {
          data: { cols },
        },
      ]) => cols.length < 2,
    }),
    "scalar.segments": {
      get section() {
        return t`Conditional colors`;
      },
      getDefault() {
        return [];
      },
      widget: ChartSettingSegmentsEditor,
      persistDefault: true,
      noPadding: true,
      props: {
        canRemoveAll: true,
      },
    },
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

    const segments = settings["scalar.segments"]?.filter((segment) =>
      segmentIsValid(segment, { allowOpenEnded: true }),
    );

    const color = getColor(value, segments);
    const tooltipContent = getTooltipContent(segments);

    const { displayValue, fullScalarValue } = compactifyValue(
      value,
      width,
      formatOptions,
    );

    const isClickable = onVisualizationClick != null;

    const handleClick = () => {
      if (this._scalar == null) {
        return;
      }

      const clickData = {
        value,
        column,
        data: rows[0]?.map((value, index) => ({ value, col: cols[index] })),
        settings,
        element: this._scalar,
      };

      if (
        this._scalar &&
        onVisualizationClick &&
        visualizationIsClickable(clickData)
      ) {
        onVisualizationClick(clickData);
      }
    };

    return (
      <ScalarWrapper>
        <ScalarValueContainer
          className={DashboardS.fullscreenNormalText}
          tooltip={fullScalarValue}
          alwaysShowTooltip={fullScalarValue !== displayValue}
          isClickable={isClickable}
        >
          <Tooltip
            label={tooltipContent}
            position="bottom"
            px="0.375rem"
            py="xs"
            disabled={!tooltipContent}
          >
            <Box
              onClick={handleClick}
              ref={(scalar) => (this._scalar = scalar)}
            >
              <ScalarValue
                color={color}
                fontFamily={fontFamily}
                gridSize={gridSize}
                height={Math.max(height - PADDING * 2, 0)}
                totalNumGridCols={totalNumGridCols}
                value={displayValue as string}
                width={Math.max(width - PADDING, 0)}
              />
            </Box>
          </Tooltip>
        </ScalarValueContainer>
      </ScalarWrapper>
    );
  }
}
