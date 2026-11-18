import { checkNotNull } from "metabase/utils/types";
import { createMockSingleSeries } from "metabase-types/api/mocks";

import { FUNNEL_CHART_DEFINITION } from "./definition";

describe("FUNNEL_CHART_DEFINITION legend.position", () => {
  const getHidden = checkNotNull(
    FUNNEL_CHART_DEFINITION.settings?.["legend.position"]?.getHidden,
  );
  const series = [createMockSingleSeries({ display: "funnel" })];

  it("should offer the setting on the bar funnel, which has a legend", () => {
    expect(getHidden(series, { "funnel.type": "bar" })).toBe(false);
  });

  it("should hide the setting on the classic funnel, which has no legend", () => {
    expect(getHidden(series, { "funnel.type": "funnel" })).toBe(true);
  });
});
