import {
  createMockActionDashboardCard,
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockHeadingDashboardCard,
} from "metabase-types/api/mocks";

import { getDashcardCards } from "./utils";

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
