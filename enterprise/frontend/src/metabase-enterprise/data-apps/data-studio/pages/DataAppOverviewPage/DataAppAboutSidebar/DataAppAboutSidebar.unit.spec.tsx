import userEvent from "@testing-library/user-event";

import {
  setupDataAppGroupsEndpoint,
  setupDataAppRepoStatusEndpoint,
  setupDataAppRepoStatusEndpointWithError,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { DataAppRepoStatus } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppAboutSidebar } from "./DataAppAboutSidebar";

type SetupOpts = {
  repoStatus?: DataAppRepoStatus;
  isRepoStatusUnavailable?: boolean;
};

function setup({
  repoStatus = { configured: false, url: null },
  isRepoStatusUnavailable = false,
}: SetupOpts) {
  const app = createMockDataApp({ name: "sales" });
  setupDataAppGroupsEndpoint(app.name, []);
  if (isRepoStatusUnavailable) {
    setupDataAppRepoStatusEndpointWithError("Server error");
  } else {
    setupDataAppRepoStatusEndpoint(repoStatus);
  }
  renderWithProviders(<DataAppAboutSidebar app={app} />, {
    withRouter: true,
    storeInitialState: {
      settings: mockSettings({ "remote-sync-branch": "main" }),
    },
  });
}

describe("DataAppAboutSidebar", () => {
  it("links to the app's folder in the connected repository", async () => {
    setup({
      repoStatus: {
        configured: true,
        url: "https://github.com/acme-inco/metabase.git",
      },
    });

    const folderUrl =
      "https://github.com/acme-inco/metabase/tree/main/data_apps/sales";
    const link = await screen.findByRole("link", { name: folderUrl });
    expect(link).toHaveAttribute("href", folderUrl);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows the app folder's path in a local repository, to copy", async () => {
    const user = userEvent.setup();
    setup({
      repoStatus: { configured: true, url: "file:///srv/git/metabase" },
    });

    const path = "/srv/git/metabase/data_apps/sales";
    expect(await screen.findByText(path)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: path })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe(path);
  });

  it("says when no repository is connected", async () => {
    setup({ repoStatus: { configured: false, url: null } });

    expect(
      await screen.findByText("No repository connected"),
    ).toBeInTheDocument();
  });

  it("says when the repository can't be loaded", async () => {
    setup({ isRepoStatusUnavailable: true });

    expect(
      await screen.findByText("Couldn't load the repository"),
    ).toBeInTheDocument();
  });
});
