import type { UnreadableCard } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { getDashboardContentItems } from "./utils";

const ORDERS = createMockCard({ id: 1, name: "Orders" });
const REVENUE = createMockCard({ id: 2, name: "Revenue", type: "metric" });
const CUSTOMERS = createMockCard({ id: 3, name: "Customers", type: "model" });

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
