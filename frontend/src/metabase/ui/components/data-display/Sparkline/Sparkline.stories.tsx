import type { ComponentStory } from "@storybook/react";

import { Sparkline } from ".";

export default {
  title: "Data Display/Sparkline",
};

const data = [
  { x: "2023-08-10T00:00:00.000Z", y: 50 },
  { x: "2023-08-11T00:00:00.000Z", y: 55 },
  { x: "2023-08-12T00:00:00.000Z", y: 53 },
  { x: "2023-08-13T00:00:00.000Z", y: 60 },
  { x: "2023-08-14T00:00:00.000Z", y: 58 },
  { x: "2023-08-15T00:00:00.000Z", y: 62 },
  { x: "2023-08-16T00:00:00.000Z", y: 65 },
  { x: "2023-08-17T00:00:00.000Z", y: 70 },
  { x: "2023-08-18T00:00:00.000Z", y: 68 },
  { x: "2023-08-19T00:00:00.000Z", y: 75 },
];

const flat = [
  { x: "2023-08-10T00:00:00.000Z", y: 50 },
  { x: "2023-08-11T00:00:00.000Z", y: 50 },
  { x: "2023-08-12T00:00:00.000Z", y: 50 },
  { x: "2023-08-13T00:00:00.000Z", y: 50 },
  { x: "2023-08-14T00:00:00.000Z", y: 50 },
  { x: "2023-08-15T00:00:00.000Z", y: 50 },
  { x: "2023-08-16T00:00:00.000Z", y: 50 },
  { x: "2023-08-17T00:00:00.000Z", y: 50 },
  { x: "2023-08-18T00:00:00.000Z", y: 50 },
  { x: "2023-08-19T00:00:00.000Z", y: 50 },
];

const upDown = [
  { x: "2023-08-10T00:00:00.000Z", y: 50 },
  { x: "2023-08-11T00:00:00.000Z", y: 55 },
  { x: "2023-08-12T00:00:00.000Z", y: 53 },
  { x: "2023-08-13T00:00:00.000Z", y: 60 },
  { x: "2023-08-14T00:00:00.000Z", y: 58 },
  { x: "2023-08-15T00:00:00.000Z", y: 62 },
  { x: "2023-08-16T00:00:00.000Z", y: 65 },
  { x: "2023-08-17T00:00:00.000Z", y: 53 },
  { x: "2023-08-18T00:00:00.000Z", y: 56 },
  { x: "2023-08-19T00:00:00.000Z", y: 45 },
];

const Template: ComponentStory<typeof Sparkline> = args => {
  return <Sparkline data={args.data} width={120} height={40} />;
};

export const Simple = Template.bind({});
Simple.args = { data };

export const Flat = Template.bind({});
Flat.args = { data: flat };

export const UpDown = Template.bind({});
UpDown.args = { data: upDown };

export const NoData = Template.bind({});
NoData.args = { data: [] };
