import type { UnreadableCard } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import {
  filterDashboardContentItems,
  getDashboardContentItemUrl,
  getDashboardContentItems,
} from "./utils";

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
  it("opens a metric saved in the Library in Data Studio", () => {
    expect(getDashboardContentItemUrl(REVENUE, "library-metrics")).toBe(
      "/data-studio/library/metrics/2",
    );
  });

  it("opens a metric saved outside the Library in the main app", () => {
    expect(getDashboardContentItemUrl(REVENUE, undefined)).toBe(
      "/metric/2-revenue",
    );
    expect(getDashboardContentItemUrl(REVENUE, "instance-analytics")).toBe(
      "/metric/2-revenue",
    );
  });

  it("opens questions and models in the main app, even in the Library", () => {
    expect(getDashboardContentItemUrl(ORDERS, undefined)).toBe(
      "/question/1-orders",
    );
    expect(getDashboardContentItemUrl(CUSTOMERS, "library-data")).toBe(
      "/model/3-customers",
    );
  });
});
