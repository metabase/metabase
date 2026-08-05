import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";

import {
  cardsContainCustomViz,
  dashboardContainsCustomViz,
} from "./contains-custom-viz";

describe("cardsContainCustomViz", () => {
  it("returns true when any card uses a custom viz display", () => {
    expect(
      cardsContainCustomViz([
        createMockCard({ display: "table" }),
        createMockCard({ display: "custom:calendar" }),
      ]),
    ).toBe(true);
  });

  it("returns false when no card uses a custom viz display", () => {
    expect(cardsContainCustomViz([createMockCard({ display: "table" })])).toBe(
      false,
    );
    expect(cardsContainCustomViz([])).toBe(false);
  });
});

describe("dashboardContainsCustomViz", () => {
  it("returns true when a dashcard's card uses a custom viz display", () => {
    const dashboard = createMockDashboard({
      dashcards: [
        createMockDashboardCard({
          card: createMockCard({ display: "custom:calendar" }),
        }),
      ],
    });
    expect(dashboardContainsCustomViz(dashboard)).toBe(true);
  });

  it("ignores virtual dashcards and handles missing dashcards", () => {
    expect(
      dashboardContainsCustomViz(
        createMockDashboard({ dashcards: [createMockTextDashboardCard()] }),
      ),
    ).toBe(false);
    expect(dashboardContainsCustomViz(null)).toBe(false);
  });
});
