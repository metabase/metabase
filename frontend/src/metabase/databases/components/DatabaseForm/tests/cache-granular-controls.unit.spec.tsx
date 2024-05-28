import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

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
  it("should not allow to configure cache ttl when query caching is not enabled", async () => {
    setupGranularCacheControls({ isCachingEnabled: false });
    await userEvent.click(screen.getByText("Show advanced options"));
    expect(
      screen.getByText("Choose when syncs and scans happen"),
    ).toBeInTheDocument();
  });
});
