import type { ComponentStory } from "@storybook/react";

import ChartSkeleton from "./ChartSkeleton";

export default {
  title: "Visualizations/ChartSkeleton",
  component: ChartSkeleton,
};

const Template: ComponentStory<typeof ChartSkeleton> = args => {
  return (
    <div style={{ padding: 8, height: 250, backgroundColor: "white" }}>
      <ChartSkeleton {...args} />
    </div>
  );
};

export const Default = Template.bind({});
Default.args = {
  display: "table",
  description: "Description",
};

export const Empty = Template.bind({
  display: null,
});

export const Area = Template.bind({});
Area.args = {
  display: "area",
  name: "Area",
};

export const Bar = Template.bind({});
Bar.args = {
  display: "bar",
  name: "Bar",
};

export const Funnel = Template.bind({});
Funnel.args = {
  display: "funnel",
  name: "Funnel",
};

export const Line = Template.bind({});
Line.args = {
  display: "line",
  name: "Line",
};

export const Map = Template.bind({});
Map.args = {
  display: "map",
  name: "Map",
};

export const Pie = Template.bind({});
Pie.args = {
  display: "pie",
  name: "Pie",
};

export const Progress = Template.bind({});
Progress.args = {
  display: "progress",
  name: "Progress",
};

export const Row = Template.bind({});
Row.args = {
  display: "row",
  name: "Row",
};

export const Scalar = Template.bind({});
Scalar.args = {
  display: "scalar",
  name: "Scalar",
};

export const Scatter = Template.bind({});
Scatter.args = {
  display: "scatter",
  name: "Scatter",
};

export const SmartScalar = Template.bind({});
SmartScalar.args = {
  display: "smartscalar",
  name: "SmartScalar",
};

export const Table = Template.bind({});
Table.args = {
  display: "table",
  name: "Table",
};

export const Waterfall = Template.bind({});
Waterfall.args = {
  display: "waterfall",
  name: "Waterfall",
};
