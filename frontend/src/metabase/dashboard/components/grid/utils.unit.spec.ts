import { MOBILE_DEFAULT_CARD_HEIGHT } from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationDisplay } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { generateMobileLayout } from "./utils";

const createMockDashcardLayout = (
  height: number,
  display: VisualizationDisplay,
) => {
  return {
    dashcard: createMockDashboardCard({
      card: createMockCard({ display }),
    }),
    h: height,
    w: 10,
    x: 0,
    y: 0,
    i: "1",
    minW: 10,
    minH: 10,
  };
};

describe("generateMobileLayout", () => {
  describe("height behavior", () => {
    it("should use height=1 for action cards", () => {
      const result = generateMobileLayout([
        createMockDashcardLayout(10, "action"),
      ]);
      expect(result[0].h).toBe(1);
    });

    it("should use height=1 for link cards", () => {
      const result = generateMobileLayout([
        createMockDashcardLayout(10, "link"),
      ]);
      expect(result[0].h).toBe(1);
    });

    it("should preserve desktop height for text cards", () => {
      const result = generateMobileLayout([
        createMockDashcardLayout(15, "text"),
      ]);
      expect(result[0].h).toBe(15);
    });

    it("should use height=2 for heading cards", () => {
      const result = generateMobileLayout([
        createMockDashcardLayout(10, "heading"),
      ]);
      expect(result[0].h).toBe(2);
    });

    it("should use height=4 for scalar cards", () => {
      const result = generateMobileLayout([
        createMockDashcardLayout(10, "scalar"),
      ]);
      expect(result[0].h).toBe(4);
    });

    it("should use default height (6) for other visualization types", () => {
      const types: VisualizationDisplay[] = [
        "bar",
        "line",
        "pie",
        "table",
        "area",
      ];
      types.forEach(type => {
        const result = generateMobileLayout([
          createMockDashcardLayout(10, type),
        ]);
        expect(result[0].h).toBe(MOBILE_DEFAULT_CARD_HEIGHT);
      });
    });
  });

  describe("layout behavior", () => {
    it("should stack cards vertically with correct y-positions", () => {
      const result = generateMobileLayout([
        createMockDashcardLayout(10, "action"), // h=1
        createMockDashcardLayout(10, "scalar"), // h=4
        createMockDashcardLayout(10, "text"), // h=10
      ]);

      expect(result[0].y).toBe(0);
      expect(result[1].y).toBe(1); // after action card
      expect(result[2].y).toBe(5); // after action + scalar
    });

    it("should set width=1 and x=0 for all cards", () => {
      const result = generateMobileLayout([
        createMockDashcardLayout(10, "bar"),
        createMockDashcardLayout(10, "scalar"),
      ]);

      result.forEach(layout => {
        expect(layout.w).toBe(1);
        expect(layout.x).toBe(0);
      });
    });
  });
});
