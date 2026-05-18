import type { Meta, StoryFn } from "@storybook/react";

import { TimeControlBar, type TimeControlBarProps } from "./TimeControlBar";

export default {
  title: "Embedding/MCP/TimeControlBar",
  component: TimeControlBar,
} satisfies Meta<typeof TimeControlBar>;

const Template: StoryFn<TimeControlBarProps> = (args) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      background: "var(--mb-color-background-primary)",
    }}
  >
    <div
      style={{
        height: "300px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: "24px",
      }}
    >
      placeholder for where the chart would be
    </div>

    <div
      style={{
        padding: "12px",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <TimeControlBar {...args} />
    </div>
  </div>
);

export const Default = {
  render: Template,
  args: {
    timeRange: {
      label: "All time",
      value: undefined,
      availableUnits: [],
      hasActiveFilter: false,
      onChange: () => {},
      onClear: () => {},
    },
    timeGranularity: {
      label: "by month",
      currentUnit: "month",
      availableItems: [],
      onChange: () => {},
    },
  },
};
