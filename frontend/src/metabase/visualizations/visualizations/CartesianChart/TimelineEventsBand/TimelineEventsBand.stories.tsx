import type { StoryObj } from "@storybook/react";
import { userEvent, within } from "@storybook/test";

import { VisualizationWrapper } from "__support__/storybook";
import { DateTimeColumn, NumberColumn } from "__support__/visualizations";
import { Box } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { LineChart } from "metabase/visualizations/visualizations/LineChart";
import { registerVisualization } from "metabase/viz-core";
import type { Series } from "metabase-types/api";
import {
  createMockCard,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

export default {
  title: "viz/TimelineEventsBand",
};

registerVisualization(LineChart);

const MONTH_COUNT = 36;

const rows = Array.from({ length: MONTH_COUNT }, (_, index) => {
  const year = 2024 + Math.floor(index / 12);
  const month = String((index % 12) + 1).padStart(2, "0");
  return [`${year}-${month}-01`, 10 + ((index * 7) % 40)];
});

// The mock mirrors the runtime series payload; the Series type additionally
// expects dataset metadata that the visualization does not read here.
const MOCK_SERIES = [
  {
    card: createMockCard({ id: 1, name: "Timeline events", display: "line" }),
    data: {
      cols: [
        DateTimeColumn({ name: "Created At" }),
        NumberColumn({ name: "Count" }),
      ],
      rows,
    },
  },
] as Series;

// At this chart width adjacent month ticks sit closer than the chip width, so
// the two release events cluster into an overlapped stack, while the three
// same-month fixes merge into a single count chip.
const TIMELINE_EVENTS = [
  createMockTimelineEvent({
    id: 1,
    name: "Product launch",
    timestamp: "2024-03-15T00:00:00Z",
    icon: "star",
  }),
  createMockTimelineEvent({
    id: 2,
    name: "Fix one",
    timestamp: "2025-02-03T00:00:00Z",
    icon: "warning",
  }),
  createMockTimelineEvent({
    id: 3,
    name: "Fix two",
    timestamp: "2025-02-14T00:00:00Z",
    icon: "warning",
  }),
  createMockTimelineEvent({
    id: 4,
    name: "Fix three",
    timestamp: "2025-02-25T00:00:00Z",
    icon: "warning",
  }),
  createMockTimelineEvent({
    id: 5,
    name: "v1.0 release",
    timestamp: "2025-10-10T00:00:00Z",
    icon: "cloud",
  }),
  createMockTimelineEvent({
    id: 6,
    name: "v1.1 release",
    timestamp: "2025-11-20T00:00:00Z",
    icon: "bell",
  }),
];

const Template = () => (
  <VisualizationWrapper>
    <Box h={500} w={800}>
      <Visualization
        rawSeries={MOCK_SERIES}
        width={800}
        timelineEvents={TIMELINE_EVENTS}
        selectedTimelineEventIds={[5]}
      />
    </Box>
  </VisualizationWrapper>
);

export const Clusters: StoryObj = {
  render: Template,
};

export const ExpandedStack: StoryObj = {
  render: Template,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stackTopChip = await canvas.findByLabelText("v1.1 release");
    await userEvent.hover(stackTopChip);
  },
};
