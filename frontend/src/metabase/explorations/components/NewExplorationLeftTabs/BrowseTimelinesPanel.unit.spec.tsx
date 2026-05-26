import userEvent from "@testing-library/user-event";
import { useEffect, useImperativeHandle, useRef } from "react";

import { setupTimelinesEndpoints } from "__support__/server-mocks/timeline";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import { useExplorationSelection } from "metabase/explorations/hooks";
import type { Timeline } from "metabase-types/api";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks/timeline";

import { BrowseTimelinesPanel } from "./BrowseTimelinesPanel";

const releases = createMockTimeline({
  id: 1,
  name: "Releases",
  description: "Product release dates",
  events: [
    createMockTimelineEvent({ id: 11, timeline_id: 1 }),
    createMockTimelineEvent({ id: 12, timeline_id: 1 }),
    createMockTimelineEvent({ id: 13, timeline_id: 1 }),
  ],
});
const incidents = createMockTimeline({
  id: 2,
  name: "Incidents",
  description: "Outages and post-mortems",
  events: [createMockTimelineEvent({ id: 21, timeline_id: 2 })],
});
const empty = createMockTimeline({
  id: 3,
  name: "Empty",
  description: null,
  events: [],
});

interface SetupOpts {
  initialTimelines?: Timeline[];
}

function Harness({
  initialTimelines,
  selectionRef,
}: {
  initialTimelines: Timeline[];
  selectionRef: React.MutableRefObject<ExplorationSelection | null>;
}) {
  const selection = useExplorationSelection();

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) {
      return;
    }
    seededRef.current = true;
    if (initialTimelines.length > 0) {
      selection.setTimelines(initialTimelines);
    }
  }, [initialTimelines, selection]);

  useImperativeHandle(selectionRef, () => selection, [selection]);

  return <BrowseTimelinesPanel selection={selection} />;
}

function setup({ initialTimelines = [] }: SetupOpts = {}) {
  setupTimelinesEndpoints([releases, incidents, empty]);

  const selectionRef: React.MutableRefObject<ExplorationSelection | null> = {
    current: null,
  };

  renderWithProviders(
    <Harness initialTimelines={initialTimelines} selectionRef={selectionRef} />,
  );

  return {
    getSelection: () => {
      const sel = selectionRef.current;
      if (!sel) {
        throw new Error("Selection ref was not populated");
      }
      return sel;
    },
  };
}

describe("BrowseTimelinesPanel", () => {
  beforeAll(() => {
    mockGetBoundingClientRect({ height: 600, width: 600 });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("renders the timelines fetched from the API", async () => {
    setup();

    expect(await screen.findByText("Releases")).toBeInTheDocument();
    expect(screen.getByText("Incidents")).toBeInTheDocument();
  });

  it("hides timelines with no events", async () => {
    setup();

    expect(await screen.findByText("Releases")).toBeInTheDocument();
    expect(screen.queryByText("Empty")).not.toBeInTheDocument();
  });

  it("checking a timeline commits it to the selection immediately", async () => {
    const { getSelection } = setup();

    const checkbox = await screen.findByRole("checkbox", { name: "Releases" });
    await userEvent.click(checkbox);

    expect(getSelection().timelines.map((t) => t.id)).toEqual([releases.id]);
  });

  it("unchecking an already-selected timeline removes it from the selection immediately", async () => {
    const { getSelection } = setup({
      initialTimelines: [releases, incidents],
    });

    const checkbox = await screen.findByRole("checkbox", { name: "Releases" });
    await userEvent.click(checkbox);

    expect(getSelection().timelines.map((t) => t.id)).toEqual([incidents.id]);
  });

  it("filters timelines by search query against name and description", async () => {
    setup();

    await screen.findByText("Releases");

    await userEvent.type(
      screen.getByPlaceholderText("Search for a timeline"),
      "outage",
    );

    await waitFor(() => {
      expect(screen.queryByText("Releases")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Incidents")).toBeInTheDocument();
  });

  it("shows the event count for each timeline", async () => {
    setup();
    await screen.findByText("Releases");

    const findRow = (name: string) =>
      screen
        .getAllByRole("listitem")
        .find((el) => within(el).queryByText(name)) as HTMLElement;

    expect(
      within(findRow("Releases")).getByText("3 events"),
    ).toBeInTheDocument();
    expect(
      within(findRow("Incidents")).getByText("1 event"),
    ).toBeInTheDocument();
  });

  it("renders timeline description alongside the name", async () => {
    setup();
    await screen.findByText("Releases");
    const row = screen
      .getAllByRole("listitem")
      .find((el) => within(el).queryByText("Releases")) as HTMLElement;
    expect(within(row).getByText("Product release dates")).toBeInTheDocument();
  });
});
