import React from "react";
import { ComponentStory } from "@storybook/react";
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
  displayName: "Area",
};

export const Bar = Template.bind({});
Bar.args = {
  display: "bar",
  displayName: "Bar",
};

export const Funnel = Template.bind({});
Funnel.args = {
  display: "funnel",
  displayName: "Funnel",
};

export const Line = Template.bind({});
Line.args = {
  display: "line",
  displayName: "Line",
};

export const Map = Template.bind({});
Map.args = {
  display: "map",
  displayName: "Map",
};

export const Pie = Template.bind({});
Pie.args = {
  display: "pie",
  displayName: "Pie",
};

export const Progress = Template.bind({});
Progress.args = {
  display: "progress",
  displayName: "Progress",
};

export const Row = Template.bind({});
Row.args = {
  display: "row",
  displayName: "Row",
};

export const Scalar = Template.bind({});
Scalar.args = {
  display: "scalar",
  displayName: "Scalar",
};

export const Scatter = Template.bind({});
Scatter.args = {
  display: "scatter",
  displayName: "Scatter",
};

export const SmartScalar = Template.bind({});
SmartScalar.args = {
  display: "smartscalar",
  displayName: "SmartScalar",
};

export const Table = Template.bind({});
Table.args = {
  display: "table",
  displayName: "Table",
};

export const Waterfall = Template.bind({});
Waterfall.args = {
  display: "waterfall",
  displayName: "Waterfall",
};
