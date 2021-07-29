import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import {
  MinRowsError,
  ChartSettingsError,
} from "metabase/visualizations/lib/errors";

import { iconPropTypes } from "metabase/components/Icon";
import LegendCaption from "metabase/visualizations/components/legend/LegendCaption";
import LegendLayout from "metabase/visualizations/components/legend/LegendLayout";

import { formatValue } from "metabase/lib/formatting";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import {
  metricSetting,
  dimensionSetting,
} from "metabase/visualizations/lib/settings/utils";
import { getLegendSettings } from "metabase/visualizations/lib/legend";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import FunnelNormal from "../components/FunnelNormal";
import FunnelBar from "../components/FunnelBar";

import _ from "underscore";
import cx from "classnames";

import type { VisualizationProps } from "metabase-types/types/Visualization";

const propTypes = {
  headerIcon: PropTypes.shape(iconPropTypes),
};

export default class Funnel extends Component {
  props: VisualizationProps;

  static uiName = t`Funnel`;
  static identifier = "funnel";
  static iconName = "funnel";

  static noHeader = true;

  static minSize = {
    width: 5,
    height: 4,
  };

  static isSensible({ cols, rows }) {
    return cols.length === 2;
  }

  static checkRenderable(series, settings) {
    const [
      {
        data: { rows },
      },
    ] = series;
    if (series.length > 1) {
      return;
    }

    if (rows.length < 1) {
      throw new MinRowsError(1, rows.length);
    }
    if (!settings["funnel.dimension"] || !settings["funnel.metric"]) {
      throw new ChartSettingsError(
        t`Which fields do you want to use?`,
        { section: t`Data` },
        t`Choose fields`,
      );
    }
  }

  // NOTE: currently expects multi-series
  static placeholderSeries = [
    ["Homepage", 1000],
    ["Product Page", 850],
    ["Tiers Page", 700],
    ["Trial Form", 200],
    ["Trial Confirmation", 40],
  ].map(row => ({
    card: {
      display: "funnel",
      visualization_settings: {
        "funnel.type": "funnel",
        "funnel.dimension": "Total Sessions",
      },
      dataset_query: { type: "null" },
    },
    data: {
      rows: [row],
      cols: [
        {
          name: "Total Sessions",
          base_type: "type/Text",
        },
        {
          name: "Sessions",
          base_type: "type/Integer",
        },
      ],
    },
  }));

  static settings = {
    ...columnSettings({ hidden: true }),
    ...dimensionSetting("funnel.dimension", {
      section: t`Data`,
      title: t`Step`,
      dashboard: false,
      useRawSeries: true,
      showColumnSetting: true,
    }),
    ...metricSetting("funnel.metric", {
      section: t`Data`,
      title: t`Measure`,
      dashboard: false,
      useRawSeries: true,
      showColumnSetting: true,
    }),
    "funnel.type": {
      title: t`Funnel type`,
      section: t`Display`,
      widget: "select",
      props: {
        options: [
          { name: t`Funnel`, value: "funnel" },
          { name: t`Bar chart`, value: "bar" },
        ],
      },
      // legacy "bar" funnel was only previously available via multiseries
      getDefault: series => (series.length > 1 ? "bar" : "funnel"),
      useRawSeries: true,
    },
  };

  static transformSeries(series) {
    const [
      {
        card,
        data: { rows, cols },
      },
    ] = series;

    const settings = getComputedSettingsForSeries(series);

    const dimensionIndex = _.findIndex(
      cols,
      col => col.name === settings["funnel.dimension"],
    );
    const metricIndex = _.findIndex(
      cols,
      col => col.name === settings["funnel.metric"],
    );

    if (
      !card._transformed &&
      series.length === 1 &&
      rows.length > 1 &&
      dimensionIndex >= 0 &&
      metricIndex >= 0
    ) {
      return rows.map(row => ({
        card: {
          ...card,
          name: formatValue(row[dimensionIndex], {
            column: cols[dimensionIndex],
          }),
          _transformed: true,
        },
        data: {
          rows: [[row[dimensionIndex], row[metricIndex]]],
          cols: [cols[dimensionIndex], cols[metricIndex]],
        },
      }));
    } else {
      return series;
    }
  }

  render() {
    const { settings } = this.props;

    if (settings["funnel.type"] === "bar") {
      return <FunnelBar {...this.props} />;
    }

    const { className, gridSize, headerIcon, isDashboard } = this.props;

    const {
      title,
      description,
      labels,
      colors,
      showCaption,
      showLegend,
      showDots,
      onSelectTitle,
    } = getLegendSettings(this.props);

    return (
      <div className={cx(className, "flex flex-column p2")}>
        {showCaption && (
          <LegendCaption
            className="pb2"
            title={title}
            description={description}
            icon={headerIcon}
            onSelectTitle={onSelectTitle}
          />
        )}
        <LegendLayout
          className="flex-full"
          labels={labels}
          colors={colors}
          gridSize={gridSize}
          showDots={showDots}
          showLegend={showLegend}
          isDashboard={isDashboard}
          showTooltip
          showDotTooltip
        >
          <FunnelNormal {...this.props} className="flex-full" />
        </LegendLayout>
      </div>
    );
  }
}

Funnel.propTypes = propTypes;
