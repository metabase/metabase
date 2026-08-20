import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { getResourceCustomVisualizations } from "./get-resource-custom-visualizations";

describe("getResourceCustomVisualizations", () => {
  it("returns the custom visualization used by a question", () => {
    const card = createMockCard({ display: "custom:calendar" });

    expect(getResourceCustomVisualizations(card)).toEqual(["custom:calendar"]);
  });

  it("returns no custom visualizations for a standard question", () => {
    const card = createMockCard({ display: "bar" });

    expect(getResourceCustomVisualizations(card)).toEqual([]);
  });

  it("returns each custom visualization used by a dashboard once", () => {
    const dashboard = createMockDashboard({
      dashcards: [
        createMockDashboardCard({
          card: createMockCard({ display: "custom:calendar" }),
        }),
        createMockDashboardCard({
          card: createMockCard({ display: "bar" }),
        }),
        createMockDashboardCard({
          card: createMockCard({ display: "custom:thumbs" }),
        }),
        createMockDashboardCard({
          card: createMockCard({ display: "custom:calendar" }),
        }),
      ],
    });

    expect(getResourceCustomVisualizations(dashboard)).toEqual([
      "custom:calendar",
      "custom:thumbs",
    ]);
  });
});
