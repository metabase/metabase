import React from "react";
import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import StaticChart from "./StaticChart";
import { STATIC_CHART_DEFAULT_OPTIONS, STATIC_CHART_TYPES } from "./constants";
import { StaticChartProps } from "./types";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "static-viz/StaticChart",
  component: StaticChart,
  argTypes: {
    type: {
      control: { type: "select" },
      options: STATIC_CHART_TYPES,
    },
    options: {
      control: { type: "object" },
    },
  },
};

const Template: ComponentStory<typeof StaticChart> = (
  args: StaticChartProps,
) => {
  const [_, updateArgs] = useArgs();

  let options = args.options;
  if (args.options.type !== args.type) {
    options =
      STATIC_CHART_DEFAULT_OPTIONS[STATIC_CHART_TYPES.indexOf(args.type)];
    updateArgs({
      ...args,
      options: {
        ...options,
        type: args.type,
      },
    });
  }

  return <StaticChart type={args.type} options={options} />;
};

export const Default = Template.bind({});
Default.args = {
  type: STATIC_CHART_TYPES[0],
  options: STATIC_CHART_DEFAULT_OPTIONS[0],
};
