import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

const ELIGIBLE_DATABASE = createMockDatabase({
  features: ["workspace"],
  settings: { "database-enable-workspaces": true },
});

type SetupOpts = {
  databases?: Database[];
  isRemoteSyncEnabled?: boolean;
};

function setup({ databases = [], isRemoteSyncEnabled = true }: SetupOpts = {}) {
  renderWithProviders(
    <Route path="*" element={<WorkspaceEmptyState databases={databases} />} />,
    {
      withRouter: true,
      storeInitialState: {
        settings: createMockSettingsState({
          "show-metabase-links": true,
          "remote-sync-enabled": isRemoteSyncEnabled,
        }),
      },
    },
  );
}

describe("WorkspaceEmptyState", () => {
  it("renders the create workspace button when there is an eligible database", () => {
    setup({ databases: [ELIGIBLE_DATABASE] });

    expect(
      screen.getByRole("button", { name: "Create a workspace" }),
    ).toBeInTheDocument();
  });

  it("links to the databases admin page when no database is eligible", () => {
    setup({ databases: [createMockDatabase()] });

    expect(
      screen.queryByRole("button", { name: "Create a workspace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("To create a workspace, you need to:"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Enable workspaces on at least one database",
      }),
    ).toHaveAttribute("href", "/admin/databases");
    expect(
      screen.queryByRole("link", { name: "Set up remote sync" }),
    ).not.toBeInTheDocument();
  });

  it("links to the remote sync settings when remote sync is not set up", () => {
    setup({ databases: [ELIGIBLE_DATABASE], isRemoteSyncEnabled: false });

    expect(
      screen.queryByRole("button", { name: "Create a workspace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set up remote sync" }),
    ).toHaveAttribute("href", "/admin/settings/remote-sync");
  });

  it("shows all errors at once", () => {
    setup({ databases: [], isRemoteSyncEnabled: false });

    expect(
      screen.getByRole("link", {
        name: "Enable workspaces on at least one database",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set up remote sync" }),
    ).toBeInTheDocument();
  });

  it("renders docs link buttons", () => {
    setup();

    expect(
      screen.getByRole("link", { name: /Agent-driven development/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Using remote sync/ }),
    ).toBeInTheDocument();
  });

  it("does not offer a config upload", () => {
    setup();

    expect(
      screen.queryByRole("button", { name: /upload/i }),
    ).not.toBeInTheDocument();
  });
});
