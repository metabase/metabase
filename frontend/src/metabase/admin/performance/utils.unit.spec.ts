import type { AdaptiveStrategy, InheritStrategy } from "metabase-types/api";

import { getShortStrategyLabel } from "./utils";

describe("getShortStrategyLabel", () => {
  it("should return null if no strategy is provided", () => {
    const result = getShortStrategyLabel();
    expect(result).toBeNull();
  });

  it("can abbreviate an 'Adaptive' strategy", () => {
    const strategy: AdaptiveStrategy = {
      type: "ttl",
      multiplier: 2,
      min_duration_ms: 1000,
    };
    const result = getShortStrategyLabel(strategy);
    expect(result).toBe("Adaptive");
  });

  it("can abbreviate a 'Use default' aka inherit strategy", () => {
    const strategy: InheritStrategy = {
      type: "inherit",
    };
    const result = getShortStrategyLabel(strategy);
    expect(result).toBe("Use default");
  });
});
