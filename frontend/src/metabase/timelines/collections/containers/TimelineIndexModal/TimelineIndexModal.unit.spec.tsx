import {
  setupCollectionByIdEndpoint,
  setupCollectionTimelinesEndpoint,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen } from "__support__/ui";
import { Api } from "metabase/api";
import type { Timeline } from "metabase-types/api";
import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import TimelineIndexModal from "./TimelineIndexModal";

const collection = createMockCollection({ id: 7, name: "Launches" });

const releases = createMockTimeline({
  id: 1,
  name: "Releases",
  collection,
  events: [createMockTimelineEvent({ id: 1, name: "RC1" })],
});

const incidents = createMockTimeline({
  id: 2,
  name: "Incidents",
  collection,
  events: [],
});

interface SetupOpts {
  timelines: Timeline[];
}

function setup({ timelines }: SetupOpts) {
  let currentTimelines = timelines;
  setupCollectionByIdEndpoint({ collections: [collection] });
  setupCollectionTimelinesEndpoint(collection.id, async () => currentTimelines);

  const { store } = renderWithProviders(
    <TimelineIndexModal
      params={{ slug: "7-launches" }}
      onClose={jest.fn<void, []>()}
    />,
  );

  const setTimelines = (timelines: Timeline[]) => {
    currentTimelines = timelines;
    act(() => {
      store.dispatch(Api.util.invalidateTags(["timeline"]));
    });
  };

  return { setTimelines };
}

describe("TimelineIndexModal", () => {
  it("shows the details of a collection's only timeline", async () => {
    setup({ timelines: [releases] });

    expect(
      await screen.findByRole("heading", { name: "Releases" }),
    ).toBeInTheDocument();
    expect(screen.getByText("RC1")).toBeInTheDocument();
  });

  it("keeps one modal mounted while it loads and when the collection is left with one timeline", async () => {
    const { setTimelines } = setup({ timelines: [releases, incidents] });
    const dialog = screen.getByRole("dialog");

    expect(
      await screen.findByRole("heading", { name: "Events" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBe(dialog);

    setTimelines([releases]);

    expect(
      await screen.findByRole("heading", { name: "Releases" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBe(dialog);
  });
});
