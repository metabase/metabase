import { createMockCard } from "metabase-types/api/mocks";

import { getDefaultStackingValue } from "./cartesian-chart";

describe("cartesian-chart settings", () => {
  describe("getDefaultStackingValue", () => {
    const areaCard = createMockCard({ display: "area" });

    it("works for legacy setting value", () => {
      const legacySettings = {
        "stackable.stacked": "stacked",
      };
      const result = getDefaultStackingValue(legacySettings, areaCard);
      expect(result).toEqual("stacked");
    });

    it("returns 'stacked' for stacked area chart", () => {
      const settings = {
        "graph.metrics": ["count"],
        "graph.dimensions": ["CREATED_AT", "CATEGORY"],
        "graph.series_order": [
          { key: "Gadget", enabled: true, name: "Gadget" },
          { key: "Gizmo", enabled: true, name: "Gizmo" },
          { name: "Doohickey", enabled: false, key: "Doohickey" },
          { name: "Widget", enabled: false, key: "Widget" },
        ],
      };
      const result = getDefaultStackingValue(settings, areaCard);
      expect(result).toEqual("stacked");
    });

    it("returns null if only one series is enabled (metabase#57370)", () => {
      const settings = {
        "graph.metrics": ["count"],
        "graph.dimensions": ["CREATED_AT", "CATEGORY"],
        "graph.series_order": [
          { key: "Gadget", enabled: true, name: "Gadget" },
          { key: "Gizmo", enabled: false, name: "Gizmo" },
          { name: "Doohickey", enabled: false, key: "Doohickey" },
          { name: "Widget", enabled: false, key: "Widget" },
        ],
      };
      const result = getDefaultStackingValue(settings, areaCard);
      expect(result).toEqual(null);
    });

    it("returns null if there is one metric and one dimension", () => {
      const settings = {
        "graph.metrics": ["count"],
        "graph.dimensions": ["CREATED_AT"],
        "graph.series_order": [
          { key: "Gadget", enabled: true, name: "Gadget" },
          { key: "Gizmo", enabled: true, name: "Gizmo" },
          { name: "Doohickey", enabled: false, key: "Doohickey" },
          { name: "Widget", enabled: false, key: "Widget" },
        ],
      };
      const result = getDefaultStackingValue(settings, areaCard);
      expect(result).toEqual(null);
    });
  });
});
