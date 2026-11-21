import userEvent from "@testing-library/user-event";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks/collection";
import { setupTimelinesEndpoints } from "__support__/server-mocks/timeline";
import { renderWithProviders, screen, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { dayjs } from "metabase/dayjs";
import type {
  TimelineEventsVisibilityIntent,
  TimelineEventsVisibilityUpdate,
} from "metabase/visualizations/types";
import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { TimelineSidebar, type TimelineSidebarProps } from "./TimelineSidebar";

const getProps = (
  opts?: Partial<TimelineSidebarProps>,
): TimelineSidebarProps => ({
  collectionId: "root",
  timelines: [],
  visibleEventIds: [],
  selectedEventIds: [],
  onUpdateVisibility: jest.fn(),
  onSelectEvents: jest.fn(),
  onDeselectEvents: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});

describe("TimelineSidebar", () => {
  beforeEach(() => {
    setupCollectionByIdEndpoint({
      collections: [
        createMockCollection({ ...ROOT_COLLECTION, can_write: true }),
      ],
    });
  });

  it("opens the new event modal", async () => {
    const timeline = createMockTimeline({
      id: 1,
      name: "Releases",
      collection: createMockCollection({ can_write: true }),
      events: [createMockTimelineEvent({ id: 1, name: "RC1", timeline_id: 1 })],
    });
    setupTimelinesEndpoints([timeline]);

    renderWithProviders(
      <TimelineSidebar
        {...getProps({ timelines: [timeline], visibleEventIds: [1] })}
      />,
    );

    expect(await screen.findByText("Create event")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Create event"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("checking a timeline shows its events outside the chart range too", async () => {
    const timeline = createMockTimeline({
      id: 1,
      name: "Releases",
      events: [
        createMockTimelineEvent({
          id: 1,
          name: "In range",
          timeline_id: 1,
          timestamp: "2024-02-01T00:00:00Z",
        }),
        createMockTimelineEvent({
          id: 2,
          name: "Out of range",
          timeline_id: 1,
          timestamp: "2025-06-01T00:00:00Z",
        }),
      ],
    });
    setupTimelinesEndpoints([timeline]);
    const onUpdateVisibility = jest.fn<
      void,
      [TimelineEventsVisibilityUpdate, TimelineEventsVisibilityIntent]
    >();

    renderWithProviders(
      <TimelineSidebar
        {...getProps({
          timelines: [timeline],
          xAxes: [
            {
              domain: [
                dayjs("2024-01-01T00:00:00Z"),
                dayjs("2024-03-01T00:00:00Z"),
              ],
              interval: { count: 1, unit: "month" },
            },
          ],
          onUpdateVisibility,
        })}
      />,
    );

    expect(await screen.findByText("In range")).toBeInTheDocument();
    expect(screen.queryByText("Out of range")).not.toBeInTheDocument();

    await userEvent.click(
      within(screen.getByLabelText("Timeline card header")).getByRole(
        "checkbox",
      ),
    );

    const [update, intent] = onUpdateVisibility.mock.calls[0];
    expect(update({}, [timeline])).toEqual({
      "timeline.selected_timeline_ids": [1],
      "timeline.excluded_timeline_event_ids": [],
    });
    expect(intent).toBe("show");
  });

  it("unchecking a timeline hides its events outside the chart range too", async () => {
    const timeline = createMockTimeline({
      id: 1,
      name: "Releases",
      events: [
        createMockTimelineEvent({
          id: 1,
          name: "In range",
          timeline_id: 1,
          timestamp: "2024-02-01T00:00:00Z",
        }),
        createMockTimelineEvent({
          id: 2,
          name: "Out of range",
          timeline_id: 1,
          timestamp: "2025-06-01T00:00:00Z",
        }),
      ],
    });
    setupTimelinesEndpoints([timeline]);
    const onUpdateVisibility = jest.fn<
      void,
      [TimelineEventsVisibilityUpdate, TimelineEventsVisibilityIntent]
    >();

    renderWithProviders(
      <TimelineSidebar
        {...getProps({
          timelines: [timeline],
          xAxes: [
            {
              domain: [
                dayjs("2024-01-01T00:00:00Z"),
                dayjs("2024-03-01T00:00:00Z"),
              ],
              interval: { count: 1, unit: "month" },
            },
          ],
          visibleEventIds: [1, 2],
          onUpdateVisibility,
        })}
      />,
    );

    expect(await screen.findByText("In range")).toBeInTheDocument();
    expect(screen.queryByText("Out of range")).not.toBeInTheDocument();

    await userEvent.click(
      within(screen.getByLabelText("Timeline card header")).getByRole(
        "checkbox",
      ),
    );

    const [update, intent] = onUpdateVisibility.mock.calls[0];
    expect(
      update(
        {
          "timeline.selected_timeline_ids": [1],
          "timeline.excluded_timeline_event_ids": [],
        },
        [timeline],
      ),
    ).toEqual({
      "timeline.selected_timeline_ids": [],
      "timeline.excluded_timeline_event_ids": [],
    });
    expect(intent).toBe("hide");
  });

  it("waits for the timelines instead of offering to create the first event", () => {
    renderWithProviders(<TimelineSidebar {...getProps({ isLoading: true })} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.queryByText("Add context to your time series charts"),
    ).not.toBeInTheDocument();
  });

  it("reports a failed load instead of claiming there are no events", () => {
    renderWithProviders(
      <TimelineSidebar
        {...getProps({ error: { data: "Timelines are unavailable" } })}
      />,
    );

    expect(screen.getByText("Timelines are unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText("Add context to your time series charts"),
    ).not.toBeInTheDocument();
  });
});
