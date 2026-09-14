import type { StoryFn } from "@storybook/react";

import ChartSkeleton, { type ChartSkeletonProps } from "./ChartSkeleton";

export default {
  title: "Viz/Components/ChartSkeleton",
  component: ChartSkeleton,
};

const Template: StoryFn<ChartSkeletonProps> = (args) => {
  return (
    <div style={{ padding: 8, height: 250, backgroundColor: "white" }}>
      <ChartSkeleton {...args} />
    </div>
  );
};

export const Default = {
  render: Template,

  args: {
    display: "table",
    description: "Description",
  },
};

export const Empty = Template.bind({
  display: null,
});

export const Area = {
  render: Template,

  args: {
    display: "area",
    name: "Area",
  },
};

export const Bar = {
  render: Template,

  args: {
    display: "bar",
    name: "Bar",
  },
};

export const Funnel = {
  render: Template,

  args: {
    display: "funnel",
    name: "Funnel",
  },
};

export const Line = {
  render: Template,

  args: {
    display: "line",
    name: "Line",
  },
};

export const Map = {
  render: Template,

  args: {
    display: "map",
    name: "Map",
  },
};

export const Pie = {
  render: Template,

  args: {
    display: "pie",
    name: "Pie",
  },
};

export const Progress = {
  render: Template,

  args: {
    display: "progress",
    name: "Progress",
  },
};

export const Row = {
  render: Template,

  args: {
    display: "row",
    name: "Row",
  },
};

export const Scalar = {
  render: Template,

  args: {
    display: "scalar",
    name: "Scalar",
  },
};

const SCALAR_CARD_SIZES: [number, number][] = [
  [82, 82],
  [256, 126],
  [345, 170],
  [433, 214],
  [520, 256],
  [609, 345],
];

// the dashboard loading state: no name, one skeleton card per size tier
export const ScalarSizeTiers = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        flexWrap: "wrap",
        padding: 16,
      }}
    >
      {SCALAR_CARD_SIZES.map(([width, height]) => (
        <div
          key={width}
          style={{
            width,
            height,
            borderRadius: 12,
            border: "1px solid var(--mb-color-border)",
          }}
        >
          <ChartSkeleton display="scalar" />
        </div>
      ))}
    </div>
  ),
};

export const Scatter = {
  render: Template,

  args: {
    display: "scatter",
    name: "Scatter",
  },
};

export const SmartScalar = {
  render: Template,

  args: {
    display: "smartscalar",
    name: "SmartScalar",
  },
};

export const Table = {
  render: Template,

  args: {
    display: "table",
    name: "Table",
  },
};

export const Waterfall = {
  render: Template,

  args: {
    display: "waterfall",
    name: "Waterfall",
  },
};
