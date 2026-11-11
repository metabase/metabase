import * as Analytics from "metabase/analytics";
import {
  createMockActionDashboardCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockHeadingDashboardCard,
  createMockIFrameDashboardCard,
  createMockLinkDashboardCard,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";

import { createMockCard } from "../../../metabase-types/api/mocks/card";

import {
  getDashCardMoveToTabUndoMessage,
  hasDashboardChanged,
  haveDashboardCardsChanged,
  trackAddedIFrameDashcards,
} from "./utils";

describe("dashboard > actions > utils", () => {
  describe("hasDashboardChanged", () => {
    it("should return false if the dashboard has not changed", () => {
      const oldDash = createMockDashboard({
        id: 1,
        name: "old name",
        parameters: [
          { id: "1", name: "old name", type: "type/Text", slug: "my_param" },
        ],
      });
      const newDash = createMockDashboard({
        id: 1,
        name: "old name",
        parameters: [
          { id: "1", name: "old name", type: "type/Text", slug: "my_param" },
        ],
      });

      expect(hasDashboardChanged(newDash, oldDash)).toBe(false);
    });

    it("should return true if the dashboard has changed", () => {
      const oldDash = createMockDashboard({ id: 1, name: "old name" });
      const newDash = createMockDashboard({ id: 1, name: "new name" });

      expect(hasDashboardChanged(newDash, oldDash)).toBe(true);
    });

    it("should return true if the deeply nested properties change", () => {
      const oldDash = createMockDashboard({
        id: 1,
        name: "old name",
        parameters: [
          { id: "1", name: "old name", type: "type/Text", slug: "my_param" },
        ],
      });
      const newDash = createMockDashboard({
        id: 1,
        name: "old name",
        parameters: [
          { id: "1", name: "new name", type: "type/Text", slug: "my_param" },
        ],
      });

      expect(hasDashboardChanged(newDash, oldDash)).toBe(true);
    });

    it("should return true if the number of cards has changed", () => {
      const oldDash = createMockDashboard({
        id: 1,
        name: "old name",
        dashcards: [createMockDashboardCard()],
      });
      const newDash = createMockDashboard({ id: 1, name: "old name" });

      expect(hasDashboardChanged(newDash, oldDash)).toBe(true);
    });

    it("should ignore card changes", () => {
      const oldDash = createMockDashboard({
        id: 1,
        name: "old name",
        dashcards: [createMockDashboardCard({ id: 1 })],
      });
      const newDash = createMockDashboard({
        id: 1,
        name: "old name",
        dashcards: [createMockDashboardCard({ id: 2 })],
      });

      expect(hasDashboardChanged(newDash, oldDash)).toBe(false);
    });
  });

  describe("haveDashboardCardsChanged", () => {
    it("should return true if a card changed", () => {
      const oldCards = [
        createMockDashboardCard({ id: 1 }),
        createMockDashboardCard({ id: 2 }),
      ];
      const newCards = [
        createMockDashboardCard({ id: 2 }),
        createMockDashboardCard({ id: 3 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(true);
    });

    it("should return true if a card was added", () => {
      const oldCards = [
        createMockDashboardCard({ id: 1 }),
        createMockDashboardCard({ id: 2 }),
      ];
      const newCards = [
        createMockDashboardCard({ id: 1 }),
        createMockDashboardCard({ id: 2 }),
        createMockDashboardCard({ id: 3 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(true);
    });

    it("should return true if a card was added and deleted", () => {
      const oldCards = [
        createMockDashboardCard({ id: 1 }),
        createMockDashboardCard({ id: 2 }),
        createMockDashboardCard({ id: 3 }),
      ];
      const newCards = [
        createMockDashboardCard({ id: 1 }),
        createMockDashboardCard({ id: 2 }),
        createMockDashboardCard({ id: 4 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(true);
    });

    it("should return true if a card was removed", () => {
      const oldCards = [
        createMockDashboardCard({ id: 1 }),
        createMockDashboardCard({ id: 2 }),
      ];
      const newCards = [createMockDashboardCard({ id: 1 })];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(true);
    });

    it("should return true if deeply nested properties change", () => {
      const oldCards = [
        createMockDashboardCard({
          id: 1,
          visualization_settings: { foo: { bar: { baz: 21 } } },
        }),
        createMockDashboardCard({ id: 2 }),
      ];
      const newCards = [
        createMockDashboardCard({
          id: 1,
          visualization_settings: { foo: { bar: { baz: 22 } } },
        }),
        createMockDashboardCard({ id: 2 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(true);
    });

    it("should return false if the dashboard cards have not changed", () => {
      const oldCards = [
        createMockDashboardCard({ id: 1 }),
        createMockDashboardCard({ id: 2 }),
      ];
      const newCards = [
        createMockDashboardCard({ id: 1 }),
        createMockDashboardCard({ id: 2 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(false);
    });

    it("should return false if the dashboard cards have only changed order", () => {
      const oldCards = [
        createMockDashboardCard({ id: 1 }),
        createMockDashboardCard({ id: 2 }),
      ];
      const newCards = [
        createMockDashboardCard({ id: 2 }),
        createMockDashboardCard({ id: 1 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(false);
    });
  });

  describe("getDashCardMoveToTabUndoMessage", () => {
    it("should return the correct message for dashCard with a name", () => {
      const dashCard = createMockDashboardCard({
        card: createMockCard({ name: "foo" }),
      });
      expect(getDashCardMoveToTabUndoMessage(dashCard)).toBe("Card moved: foo");
    });

    it("should return the correct message for a link dashCard", () => {
      const dashCard = createMockLinkDashboardCard();
      expect(getDashCardMoveToTabUndoMessage(dashCard)).toBe("Link card moved");
    });

    it("should return the correct message for an action dashCard", () => {
      const dashCard = createMockActionDashboardCard();
      expect(getDashCardMoveToTabUndoMessage(dashCard)).toBe(
        "Action card moved",
      );
    });

    it("should return the correct message for a text dashCard", () => {
      const dashCard = createMockTextDashboardCard();
      expect(getDashCardMoveToTabUndoMessage(dashCard)).toBe("Text card moved");
    });

    it("should return the correct message for a heading dashCard", () => {
      const dashCard = createMockHeadingDashboardCard();
      expect(getDashCardMoveToTabUndoMessage(dashCard)).toBe(
        "Heading card moved",
      );
    });
  });

  describe("trackAddedIFrameDashcards", () => {
    it("should track each added iframe card with its domain name", () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      const dashboard = createMockDashboard({
        id: 5,
        dashcards: [
          {
            ...createMockIFrameDashboardCard({
              id: 1,
              iframe: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            }),
            isAdded: true,
          },
          {
            ...createMockIFrameDashboardCard({
              id: 2,
              iframe: '<iframe src="https://example.com"></iframe>',
            }),
            isAdded: true,
          },
          createMockIFrameDashboardCard({ id: 3, iframe: "vimeo.com/1" }),
          { ...createMockTextDashboardCard({ id: 4 }), isAdded: true },
        ],
      });

      trackAddedIFrameDashcards(dashboard);

      expect(trackSimpleEvent).toHaveBeenCalledTimes(2);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "new_iframe_card_created",
        target_id: 5,
        event_detail: "www.youtube.com",
      });
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "new_iframe_card_created",
        target_id: 5,
        event_detail: "example.com",
      });
    });
  });
});
