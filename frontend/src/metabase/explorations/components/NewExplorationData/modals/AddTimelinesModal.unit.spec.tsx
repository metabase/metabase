import userEvent from "@testing-library/user-event";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks/collection";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { makeMockSelection } from "metabase/explorations/test-utils";
import type { Timeline } from "metabase-types/api";
import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { AddTimelinesModal } from "./AddTimelinesModal";

const releases = createMockTimeline({
  id: 7,
  name: "Releases",
  events: [createMockTimelineEvent({ id: 1, timeline_id: 7 })],
});
const marketing = createMockTimeline({
  id: 9,
  name: "Marketing",
  events: [createMockTimelineEvent({ id: 2, timeline_id: 9 })],
});
// Timelines without events are never offered by the picker.
const empty = createMockTimeline({ id: 11, name: "Empty", events: [] });

function setup({
  timelines = [],
  allTimelines = [releases, marketing, empty],
}: { timelines?: Timeline[]; allTimelines?: Timeline[] } = {}) {
  const selection = makeMockSelection({ timelines, allTimelines });

  renderWithProviders(
    <AddTimelinesModal opened onClose={jest.fn()} selection={selection} />,
  );

  return { selection };
}

function checkboxFor(name: string) {
  return screen.getByRole("checkbox", { name });
}

function lastSetTimelinesUpdater(
  selection: ReturnType<typeof setup>["selection"],
) {
  const calls = jest.mocked(selection.setTimelines).mock.calls;
  // Unjustified type cast. FIXME
  const updater = calls[calls.length - 1][0] as (
    prev: Timeline[],
  ) => Timeline[];
  return updater;
}

describe("AddTimelinesModal", () => {
  // The picker list is virtualized; give the scroll container a real size so
  // rows render in jsdom.
  beforeAll(() => {
    mockGetBoundingClientRect({ height: 600, width: 600 });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("proposes creating a timeline when there are none", async () => {
    setupCollectionByIdEndpoint({
      collections: [createMockCollection({ id: "root", can_write: true })],
    });
    setup({ allTimelines: [] });

    expect(
      screen.getByText("Add context to your time series charts"),
    ).toBeInTheDocument();
    // The CTA is a Link-wrapped Button; assert the visible text rather than the
    // (nested-interactive) link role.
    expect(await screen.findByText("Create event")).toBeInTheDocument();
  });

  it("only offers timelines that have events", () => {
    setup();

    expect(screen.getByText("Releases")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
    expect(screen.queryByText("Empty")).not.toBeInTheDocument();
  });

  it("shows the empty-state copy when the search matches no timeline", async () => {
    setup();

    await userEvent.type(
      screen.getByPlaceholderText("Search for a timeline"),
      "zzz",
    );

    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(screen.queryByText("Releases")).not.toBeInTheDocument();
  });

  it("pre-checks timelines already in the selection", () => {
    setup({ timelines: [releases] });

    expect(checkboxFor("Releases")).toBeChecked();
    expect(checkboxFor("Marketing")).not.toBeChecked();
  });

  it("reconciles the full desired set on Add — appends a newly-checked timeline", async () => {
    const { selection } = setup({ timelines: [releases] });

    await userEvent.click(checkboxFor("Marketing"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      lastSetTimelinesUpdater(selection)([releases]).map((t) => t.id),
    ).toEqual([7, 9]);
  });

  it("reconciles removals on Add — drops an unchecked timeline", async () => {
    const { selection } = setup({ timelines: [releases, marketing] });

    await userEvent.click(checkboxFor("Releases"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      lastSetTimelinesUpdater(selection)([releases, marketing]).map(
        (t) => t.id,
      ),
    ).toEqual([9]);
  });
});
