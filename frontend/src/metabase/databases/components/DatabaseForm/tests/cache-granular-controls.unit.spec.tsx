import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
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
  it("should show caching controls in advanced options when caching is enabled", async () => {
    setupGranularCacheControls({ isCachingEnabled: true });
    expect(screen.getByText("Display name")).toBeInTheDocument();
    expect(
      screen.queryByText("Default result cache duration"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Show advanced options"));
    expect(
      screen.getByText("Default result cache duration"),
    ).toBeInTheDocument();
  });

  it("should not allow to configure cache ttl when query caching is not enabled", async () => {
    setupGranularCacheControls({ isCachingEnabled: false });
    await userEvent.click(screen.getByText("Show advanced options"));
    expect(
      screen.getByText("Choose when syncs and scans happen"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Default result cache duration"),
    ).not.toBeInTheDocument();
  });

  it("should allow to submit the form with the cache ttl value", async () => {
    const { onSubmit } = setupGranularCacheControls({ isCachingEnabled: true });

    await userEvent.type(screen.getByLabelText("Display name"), "H2");
    await userEvent.type(
      screen.getByLabelText("Connection String"),
      "file:/db",
    );
    await userEvent.click(screen.getByText("Show advanced options"));
    await userEvent.click(screen.getByText("Use instance default (TTL)"));
    await userEvent.click(screen.getByText("Custom"));

    const cacheInput = screen.getByPlaceholderText("24");
    await userEvent.clear(cacheInput);
    await userEvent.type(cacheInput, "10");

    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveButton).toBeEnabled());

    await userEvent.click(saveButton);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          cache_ttl: 10,
        }),
      );
    });
  });
});
