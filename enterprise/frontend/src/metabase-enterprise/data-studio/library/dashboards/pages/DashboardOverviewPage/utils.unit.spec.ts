import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockHeadingDashboardCard,
} from "metabase-types/api/mocks";

import { getLoadingTimeMs } from "./utils";

describe("getLoadingTimeMs", () => {
  it("returns the slowest query across cards and series", () => {
    const dashboard = createMockDashboard({
      dashcards: [
        createMockDashboardCard({
          id: 1,
          card: createMockCard({ id: 1, query_average_duration: 120 }),
          series: [createMockCard({ id: 2, query_average_duration: 900 })],
        }),
        createMockDashboardCard({
          id: 2,
          card: createMockCard({ id: 3, query_average_duration: 300 }),
        }),
        createMockHeadingDashboardCard({ id: 3 }),
      ],
    });

    expect(getLoadingTimeMs(dashboard)).toBe(900);
  });

  it("returns null when no query has run", () => {
    const dashboard = createMockDashboard({
      dashcards: [
        createMockDashboardCard({
          card: createMockCard({ query_average_duration: null }),
        }),
        createMockHeadingDashboardCard(),
      ],
    });

    expect(getLoadingTimeMs(dashboard)).toBeNull();
  });
});
