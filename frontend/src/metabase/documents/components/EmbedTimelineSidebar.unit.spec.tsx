import userEvent from "@testing-library/user-event";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCollectionByIdEndpoint,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { checkNotNull } from "metabase/utils/types";
import type { TimelineEventsVisibility } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDataset,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { EmbedTimelineSidebar } from "./EmbedTimelineSidebar";

const CARD_ID = 1;

const RC1 = createMockTimelineEvent({
  id: 11,
  timeline_id: 10,
  name: "RC1",
  timestamp: "2027-06-03T00:00:00Z",
});
const RC2 = createMockTimelineEvent({
  id: 12,
  timeline_id: 10,
  name: "RC2",
  timestamp: "2027-06-15T00:00:00Z",
});
const RELEASES = createMockTimeline({
  id: 10,
  name: "Releases",
  collection_id: null,
  events: [RC1, RC2],
});

const setup = async (visibility?: TimelineEventsVisibility) => {
  const card = createMockCard({
    id: CARD_ID,
    display: "line",
    visualization_settings: { ...visibility },
  });
  setupCardEndpoints(card);
  setupCardQueryEndpoints(card, createMockDataset());
  setupTimelinesEndpoints([RELEASES]);
  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection({ ...ROOT_COLLECTION, can_write: true }),
    ],
  });

  const { store } = renderWithProviders(
    <EmbedTimelineSidebar
      cardId={CARD_ID}
      selectedEmbedIndex={0}
      collectionId={null}
    />,
  );
  await screen.findByText("RC1");
  return store;
};

const getEventCheckbox = (eventName: string) =>
  within(
    checkNotNull(
      screen
        .getAllByLabelText("Timeline event card")
        .find((card) => within(card).queryByText(eventName) != null),
    ),
  ).getByRole("checkbox");

const getTimelineCheckbox = (timelineName: string) =>
  within(
    checkNotNull(
      screen
        .getAllByLabelText("Timeline card header")
        .find((header) => within(header).queryByText(timelineName) != null),
    ),
  ).getByRole("checkbox");

const getDraftCardSettings = (store: Awaited<ReturnType<typeof setup>>) =>
  Object.values(store.getState().documents.draftCards)[0]
    ?.visualization_settings;

describe("EmbedTimelineSidebar", () => {
  it("shows the events the card recorded", async () => {
    await setup({
      "timeline.selected_timeline_ids": [RELEASES.id],
      "timeline.excluded_timeline_event_ids": [RC2.id],
    });

    expect(getEventCheckbox("RC1")).toBeChecked();
    expect(getEventCheckbox("RC2")).not.toBeChecked();
  });

  it("hiding an event records the selection on a draft card", async () => {
    const store = await setup({
      "timeline.selected_timeline_ids": [RELEASES.id],
      "timeline.excluded_timeline_event_ids": [],
    });

    await userEvent.click(getEventCheckbox("RC1"));

    await waitFor(() => {
      expect(getDraftCardSettings(store)).toEqual({
        "timeline.selected_timeline_ids": [RELEASES.id],
        "timeline.excluded_timeline_event_ids": [RC1.id],
      });
    });
  });

  it("turning a timeline on records it for a card that never recorded events", async () => {
    const store = await setup();
    expect(getEventCheckbox("RC1")).not.toBeChecked();

    await userEvent.click(getTimelineCheckbox("Releases"));

    await waitFor(() => {
      expect(getDraftCardSettings(store)).toEqual({
        "timeline.selected_timeline_ids": [RELEASES.id],
        "timeline.excluded_timeline_event_ids": [],
      });
    });
  });
});
