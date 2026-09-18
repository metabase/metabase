import userEvent from "@testing-library/user-event";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks/collection";
import { setupTimelinesEndpoints } from "__support__/server-mocks/timeline";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
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
