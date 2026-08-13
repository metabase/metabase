import type { StoryFn } from "@storybook/react";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";

import {
  StaticChoropleth,
  type StaticChoroplethProps,
} from "./StaticChoropleth";
import {
  customRegion,
  noData,
  usStates,
  usStatesCurrency,
  worldCountries,
} from "./stories-data";

export default {
  title: "Viz/Static Viz/StaticChoropleth",
  component: StaticChoropleth,
};

const renderingContext = createStaticRenderingContext();

const Template: StoryFn<StaticChoroplethProps> = (args) => {
  return (
    <div
      style={{
        border: "1px solid black",
        display: "inline-block",
      }}
    >
      <StaticChoropleth {...args} />
    </div>
  );
};

// us_states uses the geoAlbersUsa projection (with its composite Alaska/Hawaii insets).
export const USStates = {
  render: Template,
  args: { ...usStates, renderingContext },
};

// Every other region (built-in or custom) uses geoMercator().fitWidth.
export const WorldCountries = {
  render: Template,
  args: { ...worldCountries, renderingContext },
};

// A user-defined custom region with a non-default region_key, projected via Mercator + fitWidth.
export const CustomRegion = {
  render: Template,
  args: { ...customRegion, renderingContext },
};

// A currency metric: legend labels carry the column's formatting ("$1.4k"-style), matching the live
// dashboard. Guards that getStaticChoroplethSettings feeds column formatting into the legend.
export const USStatesCurrency = {
  render: Template,
  args: { ...usStatesCurrency, renderingContext },
};

// Same data with the legend placed vertically to the side (the wide-card layout the live map uses),
// instead of the default horizontal strip below the map.
export const USStatesCurrencySideLegend = {
  render: Template,
  args: { ...usStatesCurrency, renderingContext, legendPosition: "side" },
};

// No rows join to a feature: every region falls to the no-data gray and no legend is drawn.
export const NoData = {
  render: Template,
  args: { ...noData, renderingContext },
};
