import userEvent from "@testing-library/user-event";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { screen, waitFor } from "__support__/ui";
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

  it("should allow to submit the form with the cache ttl value", async () => {
    const { onSubmit } = setupGranularCacheControls({ isCachingEnabled: true });

    userEvent.type(screen.getByLabelText("Display name"), "H2");
    userEvent.type(screen.getByLabelText("Connection String"), "file:/db");
    userEvent.click(screen.getByText("Show advanced options"));
    userEvent.click(screen.getByText("Use instance default (TTL)"));
    userEvent.click(screen.getByText("Custom"));

    const cacheInput = screen.getByPlaceholderText("24");
    userEvent.clear(cacheInput);
    userEvent.type(cacheInput, "10");

    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveButton).toBeEnabled());

    userEvent.click(saveButton);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          cache_ttl: 10,
        }),
      );
    });
  });
});
