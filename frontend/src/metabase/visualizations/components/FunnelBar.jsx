/* eslint-disable react/prop-types */
import { Component } from "react";

import { assocIn } from "icepick";
import BarChart from "metabase/visualizations/visualizations/BarChart";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

export default class FunnelBar extends Component {
  render() {
    return (
      <BarChart
        {...this.props}
        isScalarSeries={true}
        settings={{
          ...this.props.settings,
          ...getComputedSettingsForSeries(
            assocIn(this.props.series, [0, "card", "display"], "bar"),
          ),
          "bar.scalar_series": true,
        }}
      />
    );
  }
}
