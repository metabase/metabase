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
  allowedHosts?: string[];
};

function setup({
  repoStatus = { configured: false, url: null },
  isRepoStatusUnavailable = false,
  allowedHosts = [],
}: SetupOpts) {
  const app = createMockDataApp({
    slug: "sales",
    allowed_hosts: allowedHosts,
  });
  setupDataAppGroupsEndpoint(app.slug, []);
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

  it("shows the app folder in a local repository, to copy", async () => {
    const user = userEvent.setup();
    setup({
      repoStatus: { configured: true, url: "file:///srv/git/metabase" },
    });

    const folder = "file:///srv/git/metabase/data_apps/sales";
    expect(await screen.findByText(folder)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: folder }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Copy repository location" }),
    );
    expect(await navigator.clipboard.readText()).toBe(folder);
  });

  it("says when no repository is connected", async () => {
    setup({ repoStatus: { configured: false, url: null } });

    expect(
      await screen.findByText("No repository connected"),
    ).toBeInTheDocument();
  });

  it("lists the external hosts the app can connect to, wildcards included", async () => {
    setup({
      allowedHosts: ["https://en.wikipedia.org", "https://*.acme.com"],
    });

    expect(
      await screen.findByText("https://en.wikipedia.org"),
    ).toBeInTheDocument();
    expect(screen.getByText("https://*.acme.com")).toBeInTheDocument();
    expect(screen.queryByText("No external hosts")).not.toBeInTheDocument();
  });

  it("says when the app can't connect to any external host", async () => {
    setup({ allowedHosts: [] });

    expect(await screen.findByText("No external hosts")).toBeInTheDocument();
  });

  it("says when the repository can't be loaded", async () => {
    setup({ isRepoStatusUnavailable: true });

    expect(
      await screen.findByText("Couldn't load the repository"),
    ).toBeInTheDocument();
  });
});
