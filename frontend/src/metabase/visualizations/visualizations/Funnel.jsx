/* eslint-disable react/prop-types */
import { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";
import {
  MinRowsError,
  ChartSettingsError,
} from "metabase/visualizations/lib/errors";

import { formatValue } from "metabase/lib/formatting";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import {
  metricSetting,
  dimensionSetting,
} from "metabase/visualizations/lib/settings/utils";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";

import ChartCaption from "metabase/visualizations/components/ChartCaption";
import { ChartSettingOrderedSimple } from "metabase/visualizations/components/settings/ChartSettingOrderedSimple";
import FunnelNormal from "../components/FunnelNormal";
import FunnelBar from "../components/FunnelBar";
import LegendHeader from "../components/LegendHeader";

const propTypes = {
  headerIcon: PropTypes.object,
};

export default class Funnel extends Component {
  static uiName = t`Funnel`;
  static identifier = "funnel";
  static iconName = "funnel";

  static noHeader = true;

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
  ].map((row, index) => ({
    card: {
      display: "funnel",
      visualization_settings: {
        "funnel.type": "funnel",
        "funnel.dimension": "Total Sessions",
      },
      dataset_query: { type: "null" },
      originalIndex: index,
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
      title: t`Column with steps`,
      dashboard: false,
      useRawSeries: true,
      showColumnSetting: true,
      marginBottom: "0.625rem",
    }),
    "funnel.order_dimension": {
      getValue: (_series, settings) => settings["funnel.dimension"],
      readDependencies: ["funnel.rows"],
    },
    "funnel.rows": {
      section: t`Data`,
      widget: ChartSettingOrderedSimple,

      getValue: (series, settings) => {
        const seriesOrder = settings["funnel.rows"];
        const seriesKeys = series.map(s => keyForSingleSeries(s));
        const orderDimension = settings["funnel.order_dimension"];
        const dimension = settings["funnel.dimension"];

        const getDefault = keys =>
          keys.map(key => ({
            key,
            name: key,
            enabled: true,
          }));
        if (
          !seriesOrder ||
          !_.isArray(seriesOrder) ||
          !seriesOrder.every(setting => setting.key !== undefined) ||
          orderDimension !== dimension
        ) {
          return getDefault(seriesKeys);
        }

        const removeMissingOrder = (keys, order) =>
          order.filter(o => keys.includes(o.key));
        const newKeys = (keys, order) =>
          keys.filter(key => !order.find(o => o.key === key));

        return [
          ...removeMissingOrder(seriesKeys, seriesOrder),
          ...getDefault(newKeys(seriesKeys, seriesOrder)),
        ];
      },
      props: {
        hasEditSettings: false,
      },
      getHidden: (series, settings) =>
        settings["funnel.dimension"] === null ||
        settings["funnel.metric"] === null,
      writeDependencies: ["funnel.order_dimension"],
      dataTestId: "funnel-row-sort",
    },
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
      return rows.map((row, index) => ({
        card: {
          ...card,
          name: formatValue(row[dimensionIndex], {
            column: cols[dimensionIndex],
          }),
          originalIndex: index,
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
    const { headerIcon, settings } = this.props;

    const hasTitle = settings["card.title"];

    if (settings["funnel.type"] === "bar") {
      return <FunnelBar {...this.props} />;
    } else {
      const { actionButtons, className, onChangeCardAndRun, series } =
        this.props;
      return (
        <div className={cx(className, "flex flex-column p1")}>
          {hasTitle && (
            <ChartCaption
              series={series}
              settings={settings}
              icon={headerIcon}
              actionButtons={actionButtons}
              onChangeCardAndRun={onChangeCardAndRun}
            />
          )}
          {!hasTitle &&
            actionButtons && ( // always show action buttons if we have them
              <LegendHeader
                className="flex-no-shrink"
                series={series._raw || series}
                actionButtons={actionButtons}
                onChangeCardAndRun={onChangeCardAndRun}
              />
            )}
          <FunnelNormal {...this.props} className="flex-full" />
        </div>
      );
    }
  }
}

Funnel.propTypes = propTypes;
