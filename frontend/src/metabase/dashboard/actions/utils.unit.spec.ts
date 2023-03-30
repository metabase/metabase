import {
  createMockDashboard,
  createMockDashboardOrderedCard,
} from "metabase-types/api/mocks";
import { hasDashboardChanged, haveDashboardCardsChanged } from "./utils";

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
        ordered_cards: [createMockDashboardOrderedCard()],
      });
      const newDash = createMockDashboard({ id: 1, name: "old name" });

      expect(hasDashboardChanged(newDash, oldDash)).toBe(true);
    });

    it("should ignore card changes", () => {
      const oldDash = createMockDashboard({
        id: 1,
        name: "old name",
        ordered_cards: [createMockDashboardOrderedCard({ id: 1 })],
      });
      const newDash = createMockDashboard({
        id: 1,
        name: "old name",
        ordered_cards: [createMockDashboardOrderedCard({ id: 2 })],
      });

      expect(hasDashboardChanged(newDash, oldDash)).toBe(false);
    });
  });

  describe("haveDashboardCardsChanged", () => {
    it("should return true if a card changed", () => {
      const oldCards = [
        createMockDashboardOrderedCard({ id: 1 }),
        createMockDashboardOrderedCard({ id: 2 }),
      ];
      const newCards = [
        createMockDashboardOrderedCard({ id: 2 }),
        createMockDashboardOrderedCard({ id: 3 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(true);
    });

    it("should return true if a card was added", () => {
      const oldCards = [
        createMockDashboardOrderedCard({ id: 1 }),
        createMockDashboardOrderedCard({ id: 2 }),
      ];
      const newCards = [
        createMockDashboardOrderedCard({ id: 1 }),
        createMockDashboardOrderedCard({ id: 2 }),
        createMockDashboardOrderedCard({ id: 3 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(true);
    });

    it("should return true if a card was added and deleted", () => {
      const oldCards = [
        createMockDashboardOrderedCard({ id: 1 }),
        createMockDashboardOrderedCard({ id: 2 }),
        createMockDashboardOrderedCard({ id: 3 }),
      ];
      const newCards = [
        createMockDashboardOrderedCard({ id: 1 }),
        createMockDashboardOrderedCard({ id: 2 }),
        createMockDashboardOrderedCard({ id: 4 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(true);
    });

    it("should return true if a card was removed", () => {
      const oldCards = [
        createMockDashboardOrderedCard({ id: 1 }),
        createMockDashboardOrderedCard({ id: 2 }),
      ];
      const newCards = [createMockDashboardOrderedCard({ id: 1 })];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(true);
    });

    it("should return true if deeply nested properties change", () => {
      const oldCards = [
        createMockDashboardOrderedCard({
          id: 1,
          visualization_settings: { foo: { bar: { baz: 21 } } },
        }),
        createMockDashboardOrderedCard({ id: 2 }),
      ];
      const newCards = [
        createMockDashboardOrderedCard({
          id: 1,
          visualization_settings: { foo: { bar: { baz: 22 } } },
        }),
        createMockDashboardOrderedCard({ id: 2 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(true);
    });

    it("should return false if the dashboard cards have not changed", () => {
      const oldCards = [
        createMockDashboardOrderedCard({ id: 1 }),
        createMockDashboardOrderedCard({ id: 2 }),
      ];
      const newCards = [
        createMockDashboardOrderedCard({ id: 1 }),
        createMockDashboardOrderedCard({ id: 2 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(false);
    });

    it("should return false if the dashboard cards have only changed order", () => {
      const oldCards = [
        createMockDashboardOrderedCard({ id: 1 }),
        createMockDashboardOrderedCard({ id: 2 }),
      ];
      const newCards = [
        createMockDashboardOrderedCard({ id: 2 }),
        createMockDashboardOrderedCard({ id: 1 }),
      ];

      expect(haveDashboardCardsChanged(newCards, oldCards)).toBe(false);
    });

    it("should perform reasonably well for 1000 cards", () => {
      const oldCards = Array(1000)
        .fill("")
        .map(index =>
          createMockDashboardOrderedCard({
            id: index,
            visualization_settings: { foo: { bar: { baz: index * 10 } } },
          }),
        );
      const newCards = Array(1000)
        .fill("")
        .map(index =>
          createMockDashboardOrderedCard({
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
});
