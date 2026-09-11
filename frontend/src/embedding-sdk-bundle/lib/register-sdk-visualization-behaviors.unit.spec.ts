import { reinitialize } from "metabase/plugins";
import { getComputedSettings } from "metabase/viz-core";
import type { ClickBehavior } from "metabase-types/api";

import { registerSdkVisualizationBehaviors } from "./register-sdk-visualization-behaviors";

const internalLink: ClickBehavior = {
  type: "link",
  linkType: "dashboard",
  targetId: 1,
};

function getSettings(enableEntityNavigation = false) {
  return getComputedSettings(
    { click_behavior: { getValue: () => internalLink } },
    {},
    {},
    { enableEntityNavigation },
  );
}

describe("SDK computed visualization settings", () => {
  afterEach(reinitialize);

  it("removes internal navigation only while SDK behavior is installed", () => {
    registerSdkVisualizationBehaviors();
    expect(getSettings().click_behavior).toBeUndefined();
    expect(getSettings(true).click_behavior).toEqual(internalLink);

    reinitialize();
    expect(getSettings().click_behavior).toEqual(internalLink);

    registerSdkVisualizationBehaviors();
    expect(getSettings().click_behavior).toBeUndefined();
  });
});
