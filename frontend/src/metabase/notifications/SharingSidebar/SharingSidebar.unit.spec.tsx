import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { getSupportedCardsForSubscriptions } from "./SharingSidebar";

describe("getSupportedCardsForSubscriptions", () => {
  it("should return an empty array if dashboard is undefined", () => {
    const result = getSupportedCardsForSubscriptions(undefined);
    expect(result).toEqual([]);
  });

  it("should filter out virtual card display types", () => {
    const dashboard = createMockDashboard({
      dashcards: [
        createMockDashboardCard({ card: createMockCard({ display: "table" }) }),
        createMockDashboardCard({ card: createMockCard({ display: "pivot" }) }),
        createMockDashboardCard({ card: createMockCard({ display: "bar" }) }),
        createMockDashboardCard({
          card: createMockCard({ display: "iframe" }),
        }),
        createMockDashboardCard({ card: createMockCard({ display: "text" }) }),
        createMockDashboardCard({
          card: createMockCard({ display: "heading" }),
        }),
        createMockDashboardCard({
          card: createMockCard({ display: "action" }),
        }),
        createMockDashboardCard({ card: createMockCard({ display: "link" }) }),
      ],
    });

    const result = getSupportedCardsForSubscriptions(dashboard);

    expect(result).toHaveLength(3);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ display: "table" }),
        expect.objectContaining({ display: "pivot" }),
        expect.objectContaining({ display: "bar" }),
      ]),
    );
  });
});
