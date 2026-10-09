import { defaultSpec } from "../defaults";

import { ANALYSIS_CONFIG } from "./config";

describe("analysis config granularity", () => {
  it("writes funnel bucket granularity", () => {
    const spec = defaultSpec("funnel");
    const { granularity } = ANALYSIS_CONFIG.funnel;
    if (granularity === undefined) {
      throw new Error("expected funnel granularity");
    }

    expect(granularity.get(spec)).toBe("week");
    expect(granularity.get(granularity.set(spec, "day"))).toBe("day");
  });

  it("writes lifecycle period and ignores hour", () => {
    const spec = defaultSpec("lifecycle");
    const { granularity } = ANALYSIS_CONFIG.lifecycle;
    if (granularity === undefined) {
      throw new Error("expected lifecycle granularity");
    }

    expect(granularity.get(spec)).toBe("week");
    expect(granularity.get(granularity.set(spec, "month"))).toBe("month");
    expect(granularity.get(granularity.set(spec, "hour"))).toBe("week");
  });

  it("writes cohort bucket granularity and falls back to week", () => {
    const spec = defaultSpec("cohorts");
    const { granularity } = ANALYSIS_CONFIG.cohorts;
    if (granularity === undefined) {
      throw new Error("expected cohorts granularity");
    }

    expect(granularity.get(spec)).toBe("week");
    expect(granularity.get(granularity.set(spec, "month"))).toBe("month");
    expect(granularity.get({ ...spec, bucket: { granularity: "day" } })).toBe(
      "week",
    );
  });
});
