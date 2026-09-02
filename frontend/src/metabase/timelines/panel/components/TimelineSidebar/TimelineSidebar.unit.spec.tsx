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

import { TimelineSidebar } from "./TimelineSidebar";

describe("TimelineSidebar", () => {
  beforeEach(() => {
    setupCollectionByIdEndpoint({
      collections: [
        createMockCollection({ ...ROOT_COLLECTION, can_write: true }),
      ],
    });
  });

  it("renders Edit/Move/New modals internally when onOpenModal is absent", async () => {
    const timeline = createMockTimeline({
      id: 1,
      name: "Releases",
      collection: createMockCollection({ can_write: true }),
      events: [createMockTimelineEvent({ id: 1, name: "RC1", timeline_id: 1 })],
    });
    setupTimelinesEndpoints([timeline]);

    renderWithProviders(
      <TimelineSidebar
        collectionId="root"
        timelines={[timeline]}
        visibleTimelineEventIds={[1]}
        selectedTimelineEventIds={[]}
        onShowTimelineEvents={jest.fn()}
        onHideTimelineEvents={jest.fn()}
      />,
    );

    expect(await screen.findByText("Create event")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Create event"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
