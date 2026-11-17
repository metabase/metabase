import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateBookmarkEndpoint,
  setupDeleteBookmarkEndpoint,
} from "__support__/server-mocks";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { screen, waitFor, within } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Bookmark, Card } from "metabase-types/api";
import { createMockBookmark } from "metabase-types/api/mocks";

import {
  TEST_MODEL_CARD,
  TEST_MODEL_DATASET,
  TEST_STRUCTURED_CARD,
  setup,
} from "./test-utils";

registerVisualizations();

interface SetupOpts {
  card: Card;
  bookmarks?: Bookmark[];
}

const setupBookmarks = async ({ card, bookmarks = [] }: SetupOpts) => {
  const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
  setupListNotificationEndpoints({ card_id: card.id }, []);
  setupCreateBookmarkEndpoint({ type: "card", item_id: card.id });
  setupDeleteBookmarkEndpoint({ type: "card", item_id: card.id });

  await setup({
    card,
    bookmarks,
    ...(card.type === "model" && {
      dataset: TEST_MODEL_DATASET,
      initialRoute: `/model/${card.id}`,
    }),
  });

  return { trackSimpleEvent };
};

const getCardBookmark = (card: Card) =>
  createMockBookmark({
    id: `card-${card.id}`,
    type: "card",
    item_id: card.id,
    name: card.name,
    card_type: card.type,
  });

const bookmarkCalls = (card: Card, method: "POST" | "DELETE") =>
  fetchMock.callHistory.calls(`path:/api/bookmark/card/${card.id}`, {
    method,
  });

const getActionPanelButton = (name: string) =>
  within(screen.getByTestId("qb-header-action-panel")).getByRole("button", {
    name,
  });

describe("QueryBuilder > bookmarks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    { card: TEST_STRUCTURED_CARD, eventDetail: "question" },
    { card: TEST_MODEL_CARD, eventDetail: "model" },
  ])(
    "bookmarks a $eventDetail from the header and tracks it",
    async ({ card, eventDetail }) => {
      const { trackSimpleEvent } = await setupBookmarks({ card });

      await userEvent.click(getActionPanelButton("Bookmark"));

      await waitFor(() => expect(bookmarkCalls(card, "POST")).toHaveLength(1));
      const bookmarkEvents = trackSimpleEvent.mock.calls.filter(
        ([event]) => event.event === "bookmark_added",
      );
      expect(bookmarkEvents).toEqual([
        [
          {
            event: "bookmark_added",
            event_detail: eventDetail,
            triggered_from: "qb_action_panel",
          },
        ],
      ]);
    },
  );

  it.each([
    { card: TEST_STRUCTURED_CARD, eventDetail: "question" },
    { card: TEST_MODEL_CARD, eventDetail: "model" },
  ])(
    "removes a $eventDetail bookmark from the header without tracking it",
    async ({ card }) => {
      const { trackSimpleEvent } = await setupBookmarks({
        card,
        bookmarks: [getCardBookmark(card)],
      });

      await userEvent.click(
        await within(screen.getByTestId("qb-header-action-panel")).findByRole(
          "button",
          { name: "Remove from bookmarks" },
        ),
      );

      await waitFor(() =>
        expect(bookmarkCalls(card, "DELETE")).toHaveLength(1),
      );
      expect(bookmarkCalls(card, "POST")).toHaveLength(0);
      expect(trackSimpleEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "bookmark_added" }),
      );
    },
  );
});
