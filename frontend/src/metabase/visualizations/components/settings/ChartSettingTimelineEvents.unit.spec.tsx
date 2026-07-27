import userEvent from "@testing-library/user-event";

import { setupTimelinesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Timeline, TimelineId } from "metabase-types/api";
import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { ChartSettingTimelineEvents } from "./ChartSettingTimelineEvents";

const releasesTimeline = createMockTimeline({
  id: 1,
  name: "Releases",
  collection: createMockCollection({ name: "Engineering" }),
  events: [
    createMockTimelineEvent({ id: 101, timeline_id: 1 }),
    createMockTimelineEvent({ id: 102, timeline_id: 1 }),
  ],
});

const marketingTimeline = createMockTimeline({
  id: 2,
  name: "Campaigns",
  collection: createMockCollection({ name: "Marketing" }),
  events: [createMockTimelineEvent({ id: 201, timeline_id: 2 })],
});

interface SetupOpts {
  timelines?: Timeline[];
  value?: TimelineId[];
}

const setup = ({ timelines = [], value }: SetupOpts = {}) => {
  setupTimelinesEndpoints(timelines);
  const onChange = jest.fn();

  renderWithProviders(
    <ChartSettingTimelineEvents value={value} onChange={onChange} />,
  );

  return { onChange };
};

describe("ChartSettingTimelineEvents", () => {
  it("should show an empty state when there are no timelines", async () => {
    setup();

    expect(await screen.findByText(/No timelines yet/)).toBeInTheDocument();
  });

  it("should render a checkbox per timeline with collection and event count", async () => {
    setup({ timelines: [releasesTimeline, marketingTimeline], value: [1] });

    expect(await screen.findByLabelText("Releases")).toBeChecked();
    expect(screen.getByLabelText("Campaigns")).not.toBeChecked();
    expect(screen.getByText("Engineering · 2 events")).toBeInTheDocument();
    expect(screen.getByText("Marketing · 1 event")).toBeInTheDocument();
  });

  it("should add a timeline to the selection", async () => {
    const { onChange } = setup({
      timelines: [releasesTimeline, marketingTimeline],
      value: [1],
    });

    await userEvent.click(await screen.findByLabelText("Campaigns"));

    expect(onChange).toHaveBeenCalledWith([1, 2]);
  });

  it("should remove a timeline from the selection", async () => {
    const { onChange } = setup({
      timelines: [releasesTimeline, marketingTimeline],
      value: [1, 2],
    });

    await userEvent.click(await screen.findByLabelText("Releases"));

    expect(onChange).toHaveBeenCalledWith([2]);
  });

  it("should handle an undefined value as no selection", async () => {
    const { onChange } = setup({ timelines: [releasesTimeline] });

    await userEvent.click(await screen.findByLabelText("Releases"));

    expect(onChange).toHaveBeenCalledWith([1]);
  });
});
