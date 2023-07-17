import userEvent from "@testing-library/user-event";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupGranularCacheControls = (opts: SetupOpts) => {
  return setup({
    ...opts,
    settings: createMockSettings({
      ...opts?.settings,
      "token-features": createMockTokenFeatures({
        cache_granular_controls: true,
      }),
    }),
    hasEnterprisePlugins: true,
  });
};

describe("DatabaseForm", () => {
  it("should show caching controls in advanced options when caching is enabled", () => {
    setupGranularCacheControls({ isCachingEnabled: true });
    expect(screen.getByText("Display name")).toBeInTheDocument();
    expect(
      screen.queryByText("Default result cache duration"),
    ).not.toBeInTheDocument();

    userEvent.click(screen.getByText("Show advanced options"));
    expect(
      screen.getByText("Default result cache duration"),
    ).toBeInTheDocument();
  });

  it("should not allow to configure cache ttl when query caching is not enabled", () => {
    setupGranularCacheControls({ isCachingEnabled: false });
    userEvent.click(screen.getByText("Show advanced options"));
    expect(
      screen.getByText("Choose when syncs and scans happen"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Default result cache duration"),
    ).not.toBeInTheDocument();
  });
});
