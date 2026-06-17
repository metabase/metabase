import type { StoryFn } from "@storybook/react";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";

import {
  StaticChoropleth,
  type StaticChoroplethProps,
} from "./StaticChoropleth";
import { customRegion, noData, usStates, worldCountries } from "./stories-data";

export default {
  title: "Viz/Static Viz/StaticChoropleth",
  component: StaticChoropleth,
};

const renderingContext = createStaticRenderingContext();

const Template: StoryFn<StaticChoroplethProps> = (args) => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
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

// No rows join to a feature: every region falls to the no-data gray and no legend is drawn.
export const NoData = {
  render: Template,
  args: { ...noData, renderingContext },
};
