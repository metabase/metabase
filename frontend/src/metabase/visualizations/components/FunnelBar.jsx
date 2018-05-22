/* @flow */

import React, { Component } from "react";

import BarChart from "metabase/visualizations/visualizations/BarChart.jsx";

import { getSettings } from "metabase/visualizations/lib/settings";
import { assocIn } from "icepick";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

export default class BarFunnel extends Component {
  props: VisualizationProps;

  render() {
    return (
      <BarChart
        {...this.props}
        isScalarSeries={true}
        settings={{
          ...this.props.settings,
          ...getSettings(
            assocIn(this.props.series, [0, "card", "display"], "bar"),
          ),
          "bar.scalar_series": true,
        }}
      />
    );
  }
}
