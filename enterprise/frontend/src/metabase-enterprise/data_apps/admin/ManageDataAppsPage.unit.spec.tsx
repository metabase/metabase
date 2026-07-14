import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupUserAcknowledgementEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { Route } from "metabase/router";
import type { DataApp } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { ManageDataAppsPage } from "./ManageDataAppsPage";

type SetupOpts = {
  configured?: boolean;
  url?: string | null;
  apps?: DataApp[];
};

const setup = ({
  configured = true,
  url = null,
  apps = [],
}: SetupOpts = {}) => {
  fetchMock.get("path:/api/apps/repo-status", { configured, url });
  fetchMock.get("path:/api/apps", apps);

  setupUserAcknowledgementEndpoints({
    key: "data-apps-admin-settings-banner",
    value: true,
  });

  const Page = () => (
    <>
      <ManageDataAppsPage />
      <UndoListing />
    </>
  );

  renderWithProviders(<Route path="/" component={Page} />, {
    withRouter: true,
  });
};

const openActionsMenu = async (displayName: string) =>
  userEvent.click(
    await screen.findByRole("button", { name: `Actions for ${displayName}` }),
  );

describe("ManageDataAppsPage", () => {
  describe("empty states", () => {
    it("shows the generic empty state, and no duplicate 'no repository' message, when no repo is connected", async () => {
      setup({ configured: false });

      expect(
        await screen.findByText("Your data apps will appear here"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/No repository is connected yet/),
      ).not.toBeInTheDocument();
    });

    it("shows the empty state when a connected repository has no apps", async () => {
      const url = "https://github.com/metabase/stats-remote-sync";
      setup({ configured: true, url });

      expect(await screen.findByText(url)).toBeInTheDocument();
      expect(
        await screen.findByText("Your data apps will appear here"),
      ).toBeInTheDocument();
    });

    it("shows the setup section: repo status, the Git sync link, and the install command", async () => {
      setup({ configured: false });

      expect(
        await screen.findByText("No repository connected"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Go to Git sync settings" }),
      ).toHaveAttribute("href", "/admin/settings/remote-sync");
      expect(
        screen.getByText(/npx skills add metabase\/metabase/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/--skill metabase-data-app-setup/),
      ).toBeInTheDocument();
    });
  });

  describe("the app list", () => {
    it("links an enabled app to its route and shows its path", async () => {
      setup({ apps: [createMockDataApp({ name: "sales" })] });

      expect(
        await screen.findByRole("link", { name: "Sales" }),
      ).toHaveAttribute("href", "/apps/sales");
      expect(screen.getByText("/apps/sales")).toBeInTheDocument();
    });

    it("shows a disabled app as plain text with a Disabled badge", async () => {
      setup({ apps: [createMockDataApp({ name: "sales", enabled: false })] });

      expect(await screen.findByText("Sales")).toBeInTheDocument();
      // A disabled app isn't reachable, so its name isn't a link.
      expect(
        screen.queryByRole("link", { name: "Sales" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });

    it("gives every app its own actions menu", async () => {
      setup({
        apps: [
          createMockDataApp({
            id: 1,
            name: "alpha",
            display_name: "Alpha App",
          }),
          createMockDataApp({ id: 2, name: "beta", display_name: "Beta App" }),
        ],
      });

      expect(
        await screen.findByRole("link", { name: "Alpha App" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Beta App" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Actions for Alpha App" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Actions for Beta App" }),
      ).toBeInTheDocument();
    });

    it("renders each sync status: a synced sha, a failure with its reason, and never-synced", async () => {
      setup({
        apps: [
          createMockDataApp({
            id: 1,
            display_name: "Synced App",
            last_synced_sha: "abcdef0",
          }),
          createMockDataApp({
            id: 2,
            display_name: "Failed App",
            sync_error: "boom: bad manifest",
          }),
          createMockDataApp({
            id: 3,
            display_name: "New App",
            last_synced_sha: null,
            sync_error: null,
          }),
        ],
      });

      expect(await screen.findByText("Synced abcdef0")).toBeInTheDocument();
      expect(screen.getByText("Sync failed")).toHaveAttribute(
        "title",
        "boom: bad manifest",
      );
      expect(screen.getByText("Not synced yet")).toBeInTheDocument();
    });

    it("shows how many hosts an app is allowed to reach", async () => {
      setup({
        apps: [
          createMockDataApp({
            allowed_hosts: ["https://api.example.com", "https://*.acme.com"],
          }),
        ],
      });

      expect(await screen.findByText("2 allowed hosts")).toBeInTheDocument();
    });
  });

  describe("actions", () => {
    it("disables an app", async () => {
      setup({ apps: [createMockDataApp({ name: "sales" })] });
      fetchMock.put(
        "path:/api/apps/sales",
        createMockDataApp({ enabled: false }),
      );

      await openActionsMenu("Sales");
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Disable" }),
      );

      const request = fetchMock.callHistory.lastCall("path:/api/apps/sales");
      expect(await request?.request?.json()).toEqual({ enabled: false });
    });

    it("re-enables a disabled app", async () => {
      setup({ apps: [createMockDataApp({ name: "sales", enabled: false })] });
      fetchMock.put("path:/api/apps/sales", createMockDataApp());

      await openActionsMenu("Sales");
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Re-enable" }),
      );

      const request = fetchMock.callHistory.lastCall("path:/api/apps/sales");
      expect(await request?.request?.json()).toEqual({ enabled: true });
    });

    it("offers no Remove while a repository is connected", async () => {
      // A removed app would just come back on the next sync, so Remove is only
      // offered once the repo is unlinked.
      setup({ configured: true, apps: [createMockDataApp({ name: "sales" })] });

      await openActionsMenu("Sales");

      expect(
        await screen.findByRole("menuitem", { name: "Disable" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "Remove" }),
      ).not.toBeInTheDocument();
    });

    it("removes an app once the repository is unlinked", async () => {
      // A sync never deletes, so an app synced while a repo was connected stays
      // listed after unlinking — with a Remove action to clear it out.
      setup({
        configured: false,
        apps: [createMockDataApp({ name: "sales" })],
      });
      fetchMock.delete("path:/api/apps/sales", 204);

      await openActionsMenu("Sales");
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Remove" }),
      );
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Remove",
        }),
      );

      expect(
        fetchMock.callHistory.called("path:/api/apps/sales", {
          method: "DELETE",
        }),
      ).toBe(true);
    });
  });
});
