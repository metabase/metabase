import {
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";
import { createMockCard } from "./../../../metabase-types/api/mocks/card";
import {
  getDashCardMoveToTabUndoMessage,
  hasDashboardChanged,
  haveDashboardCardsChanged,
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

    it("should perform reasonably well for 1000 cards", () => {
      const oldCards = Array(1000)
        .fill("")
        .map(index =>
          createMockDashboardCard({
            id: index,
            visualization_settings: { foo: { bar: { baz: index * 10 } } },
          }),
        );
      const newCards = Array(1000)
        .fill("")
        .map(index =>
          createMockDashboardCard({
            id: index,
            visualization_settings: { foo: { bar: { baz: index * 10 } } },
          }),
        );

      const startTime = performance.now();
      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(false);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100); // 100 ms (locally this was 6 ms)
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
      const dashCard = createMockDashboardCard({
        card: createMockCard({ name: undefined }),
        visualization_settings: { virtual_card: { display: "link" } },
      });
      expect(getDashCardMoveToTabUndoMessage(dashCard)).toBe("Link card moved");
    });

    it("should return the correct message for an action dashCard", () => {
      const dashCard = createMockDashboardCard({
        card: createMockCard({ name: undefined }),
        visualization_settings: { virtual_card: { display: "action" } },
      });
      expect(getDashCardMoveToTabUndoMessage(dashCard)).toBe(
        "Action card moved",
      );
    });

    it("should return the correct message for a text dashCard", () => {
      const dashCard = createMockDashboardCard({
        card: createMockCard({ name: undefined }),
        visualization_settings: { virtual_card: { display: "text" } },
      });
      expect(getDashCardMoveToTabUndoMessage(dashCard)).toBe("Text card moved");
    });

    it("should return the correct message for a heading dashCard", () => {
      const dashCard = createMockDashboardCard({
        card: createMockCard({ name: undefined }),
        visualization_settings: { virtual_card: { display: "heading" } },
      });
      expect(getDashCardMoveToTabUndoMessage(dashCard)).toBe(
        "Heading card moved",
      );
    });
  });
});
