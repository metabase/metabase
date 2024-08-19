import type { ComponentStory } from "@storybook/react";

import { Sparkline } from ".";

export default {
  title: "Data Display/Sparkline",
};

function make(data: number[]): Datapoint[] {
  return data.map((d, i) => ({ x: i, y: d }));
}

const data = make([50, 55, 53, 60, 58, 62, 65, 70, 68, 75]);
const flat = make([50, 50, 50, 50, 50, 50, 50, 50, 50, 50]);
const upDown = make([50, 55, 53, 60, 58, 62, 65, 53, 56, 45]);

const lotsOfData = [
  62, 65, 53, 56, 50, 62, 65, 53, 56, 50, 55, 53, 60, 58, 62, 65, 53, 56, 45,
  62, 65, 53, 56, 62, 65, 53, 56, 45, 62, 65, 53, 62, 65, 53, 56, 50, 62, 65,
  53, 56, 50, 55, 53, 60, 58, 62, 65, 53, 56, 45, 62, 65, 53, 56, 62, 65, 53,
  56, 45, 62, 65, 53,
].map((d, i) => ({ x: i, y: d }));

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
