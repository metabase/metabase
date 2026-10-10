import type { UnreadableCard } from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockHeadingDashboardCard,
} from "metabase-types/api/mocks";

import {
  filterDashboardContentItems,
  getDashboardContentItemUrl,
  getDashboardContentItems,
  getDashcardCards,
} from "./utils";

const ORDERS = createMockCard({ id: 1, name: "Orders" });
const REVENUE = createMockCard({ id: 2, name: "Revenue", type: "metric" });
const CUSTOMERS = createMockCard({ id: 3, name: "Customers", type: "model" });

describe("getDashcardCards", () => {
  it("returns the cards of question dashcards and their series in dashcard order", () => {
    const dashboard = createMockDashboard({
      dashcards: [
        createMockDashboardCard({ id: 1, card: ORDERS, series: [REVENUE] }),
        createMockDashboardCard({ id: 2, card: CUSTOMERS }),
        createMockDashboardCard({ id: 3, card: ORDERS }),
      ],
    });

    expect(getDashcardCards(dashboard)).toEqual([
      ORDERS,
      REVENUE,
      CUSTOMERS,
      ORDERS,
    ]);
  });

  it("skips virtual and action dashcards", () => {
    const dashboard = createMockDashboard({
      dashcards: [
        createMockHeadingDashboardCard({ id: 1 }),
        createMockActionDashboardCard({
          id: 2,
          card: createMockCard({ id: 9, name: "Action model" }),
        }),
        createMockDashboardCard({ id: 3, card: ORDERS }),
      ],
    });

    expect(getDashcardCards(dashboard)).toEqual([ORDERS]);
  });

  it("returns nothing for an empty dashboard", () => {
    expect(getDashcardCards(createMockDashboard({ dashcards: [] }))).toEqual(
      [],
    );
  });
});

describe("getDashboardContentItems", () => {
  it("returns each card once, in order", () => {
    expect(
      getDashboardContentItems([ORDERS, REVENUE, ORDERS, CUSTOMERS, REVENUE]),
    ).toEqual([ORDERS, REVENUE, CUSTOMERS]);
  });

  it("skips cards the user cannot read, which the API sends as a bare id", () => {
    const unreadableCard: UnreadableCard = { id: 4 };

    expect(
      getDashboardContentItems([
        unreadableCard,
        REVENUE,
        ORDERS,
        unreadableCard,
      ]),
    ).toEqual([REVENUE, ORDERS]);
  });
});

describe("filterDashboardContentItems", () => {
  const items = [ORDERS, REVENUE, CUSTOMERS];

  it("matches names case-insensitively", () => {
    expect(filterDashboardContentItems(items, "  rEv ")).toEqual([REVENUE]);
  });

  it("returns every item for a blank query", () => {
    expect(filterDashboardContentItems(items, " ")).toEqual(items);
  });
});

describe("getDashboardContentItemUrl", () => {
  it("opens a metric in Data Studio", () => {
    expect(getDashboardContentItemUrl(REVENUE)).toBe(
      "/data-studio/library/metrics/2",
    );
  });

  it("opens questions and models in the main app", () => {
    expect(getDashboardContentItemUrl(ORDERS)).toBe("/question/1-orders");
    expect(getDashboardContentItemUrl(CUSTOMERS)).toBe("/model/3-customers");
  });
});
