import userEvent from "@testing-library/user-event";

import { setupTimelinesEndpoints } from "__support__/server-mocks/timeline";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { Timeline } from "metabase-types/api";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks/timeline";

import { AddTimelinesModal } from "./AddTimelinesModal";

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

function setup({ initialTimelines = [] }: SetupOpts = {}) {
  setupTimelinesEndpoints([releases, incidents, empty]);

  const onSelectedItemsChange = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <AddTimelinesModal
      opened
      onClose={onClose}
      selectedTimelines={initialTimelines}
      onSelectedItemsChange={onSelectedItemsChange}
    />,
  );

  return { onSelectedItemsChange, onClose };
}

async function clickDone() {
  await userEvent.click(screen.getByRole("button", { name: "Done" }));
}

describe("AddTimelinesModal", () => {
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

  it("toggles do not call onSelectedItemsChange until Done is clicked", async () => {
    const { onSelectedItemsChange } = setup();

    const checkbox = await screen.findByRole("checkbox", { name: "Releases" });
    await userEvent.click(checkbox);

    expect(onSelectedItemsChange).not.toHaveBeenCalled();
  });

  it("Done commits the checked timeline and closes the modal", async () => {
    const { onSelectedItemsChange, onClose } = setup();

    const checkbox = await screen.findByRole("checkbox", { name: "Releases" });
    await userEvent.click(checkbox);
    await clickDone();

    expect(onSelectedItemsChange).toHaveBeenCalledTimes(1);
    expect(onSelectedItemsChange.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: releases.id }),
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Done commits removal of an unchecked timeline", async () => {
    const { onSelectedItemsChange } = setup({
      initialTimelines: [releases, incidents],
    });

    const checkbox = await screen.findByRole("checkbox", { name: "Releases" });
    await userEvent.click(checkbox);
    await clickDone();

    expect(onSelectedItemsChange).toHaveBeenCalledTimes(1);
    expect(onSelectedItemsChange.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: incidents.id }),
    ]);
  });

  it("closing without Done discards in-flight edits", async () => {
    const { onSelectedItemsChange, onClose } = setup();

    const checkbox = await screen.findByRole("checkbox", { name: "Releases" });
    await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onSelectedItemsChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("filters timelines by search query against name and description", async () => {
    setup();

    await screen.findByText("Releases");

    await userEvent.type(
      screen.getByPlaceholderText("Search for timelines"),
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
    expect(within(findRow("Empty")).getByText("0 events")).toBeInTheDocument();
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
