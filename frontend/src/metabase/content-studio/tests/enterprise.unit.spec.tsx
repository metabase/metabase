import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";

import { type SetupOpts, setup } from "./setup";

function setupEnterprise(opts: SetupOpts = {}) {
  setup({
    enterprisePlugins: ["content_studio"],
    tokenFeatures: { remote_sync: true },
    ...opts,
  });
}

describe("Content Studio routes (EE)", () => {
  afterEach(() => {
    reinitialize();
  });

  it("renders the setup state when remote sync is not configured", async () => {
    setupEnterprise({ remoteSyncEnabled: false });

    expect(await screen.findByTestId("content-studio-nav")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        name: "Connect a repository to get started",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to remote sync settings" }),
    ).toHaveAttribute("href", "/admin/settings/remote-sync");

    await userEvent.click(
      screen.getByRole("button", { name: "Set up remote sync" }),
    );

    expect(
      await screen.findByText("Set up remote sync for your Library"),
    ).toBeInTheDocument();
  });

  it("renders the plugin routes when remote sync is configured", async () => {
    setupEnterprise({ remoteSyncEnabled: true });

    expect(
      await screen.findByRole("heading", { name: "Collections" }),
    ).toBeInTheDocument();
  });

  it("opens the shared content view from the sidebar's namespace rows", async () => {
    setupEnterprise({ remoteSyncEnabled: true });

    await userEvent.click(
      await screen.findByRole("link", { name: "Transforms" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Transforms", level: 2 }),
    ).toBeInTheDocument();
  });

  it("renders the branch selector in the sidebar", async () => {
    setupEnterprise({ remoteSyncEnabled: true });

    expect(
      await screen.findByRole("button", { name: "Branch: Main (main)" }),
    ).toBeInTheDocument();
  });

  it("does not render the branch selector until remote sync is set up", async () => {
    setupEnterprise({ remoteSyncEnabled: false });

    expect(await screen.findByTestId("content-studio-nav")).toBeInTheDocument();
    expect(
      screen.queryByTestId("content-studio-branch-selector"),
    ).not.toBeInTheDocument();
  });

  it("explains that the main branch needs a synced Library to manage snippets", async () => {
    setupEnterprise({
      remoteSyncEnabled: true,
      initialRoute: "/content-studio/snippets",
    });

    expect(
      await screen.findByRole("heading", { name: "SQL snippets", level: 2 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Snippets are synced along with the Library. Turn on Library sync to manage them from here.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "New snippet" }),
    ).not.toBeInTheDocument();
  });

  it("explains that the main branch needs transform sync to manage transforms", async () => {
    setupEnterprise({
      remoteSyncEnabled: true,
      initialRoute: "/content-studio/transforms",
    });

    expect(
      await screen.findByRole("heading", { name: "Transforms", level: 2 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Transforms aren't part of remote sync yet. Turn on transform sync to manage them from here.",
      ),
    ).toBeInTheDocument();
  });

  it("renders not found inside the shell for an unknown path", async () => {
    setupEnterprise({
      remoteSyncEnabled: true,
      initialRoute: "/content-studio/nope",
    });

    expect(await screen.findByTestId("content-studio-nav")).toBeInTheDocument();
    expect(await screen.findByLabelText("error page")).toBeInTheDocument();
  });

  it("renders the remote sync upsell without the remote_sync feature", async () => {
    setupEnterprise({ tokenFeatures: { remote_sync: false } });

    expect(
      await screen.findByRole("heading", {
        name: "Manage your Metabase content in Git",
      }),
    ).toBeInTheDocument();
  });
});
