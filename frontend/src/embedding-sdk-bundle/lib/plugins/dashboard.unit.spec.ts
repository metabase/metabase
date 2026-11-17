import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";

import { addDefaultDashboardPluginValues } from "./dashboard";

const DEFAULTS = {
  withDownloads: true,
  withEditLink: true,
  customItems: [],
};

describe("addDefaultDashboardPluginValues", () => {
  it("applies defaults when there is no config", () => {
    expect(addDefaultDashboardPluginValues()).toEqual({
      dashboard: { dashboardCardMenu: DEFAULTS },
    });
  });

  it("merges a partial config with the defaults", () => {
    const plugins: MetabasePluginsConfig = {
      dashboard: { dashboardCardMenu: { withDownloads: false } },
    };

    expect(addDefaultDashboardPluginValues(plugins)).toEqual({
      dashboard: {
        dashboardCardMenu: { ...DEFAULTS, withDownloads: false },
      },
    });
  });

  it("passes a custom menu function through unchanged", () => {
    const dashboardCardMenu = jest.fn();

    const result = addDefaultDashboardPluginValues({
      dashboard: { dashboardCardMenu },
    });

    expect(result.dashboard?.dashboardCardMenu).toBe(dashboardCardMenu);
  });

  it("keeps other plugins", () => {
    const mapQuestionClickActions = jest.fn();

    expect(
      addDefaultDashboardPluginValues({ mapQuestionClickActions }),
    ).toMatchObject({ mapQuestionClickActions });
  });
});
