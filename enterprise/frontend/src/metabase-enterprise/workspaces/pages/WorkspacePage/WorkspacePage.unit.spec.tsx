import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDatabaseListEndpoint,
  setupDeleteWorkspaceEndpoint,
  setupDeprovisionWorkspaceEndpoint,
  setupGetWorkspaceEndpoint,
  setupProvisionWorkspaceEndpoint,
  setupUpdateWorkspaceEndpoint,
} from "__support__/server-mocks";
import {
  getIcon,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { Workspace } from "metabase-types/api";
import {
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { WorkspacePage } from "./WorkspacePage";

type SetupOpts = {
  workspace: Workspace;
};

function setup({ workspace }: SetupOpts) {
  setupGetWorkspaceEndpoint(workspace);
  setupUpdateWorkspaceEndpoint(workspace);
  setupDeleteWorkspaceEndpoint(workspace.id);
  setupProvisionWorkspaceEndpoint(workspace.id);
  setupDeprovisionWorkspaceEndpoint(workspace.id);
  setupDatabaseListEndpoint([]);
  renderWithProviders(
    <>
      <Route
        path="/data-studio/workspaces"
        component={() => <div>Workspace list</div>}
      />
      <Route
        path="/data-studio/workspaces/:workspaceId"
        component={WorkspacePage}
      />
    </>,
    {
      withRouter: true,
      initialRoute: `/data-studio/workspaces/${workspace.id}`,
    },
  );
}

describe("WorkspacePage", () => {
  it("should rename a workspace via the header", async () => {
    const workspace = createMockWorkspace({ name: "Analytics" });
    setup({ workspace });

    const input = await screen.findByDisplayValue("Analytics");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    await userEvent.tab();

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(`path:/api/ee/workspace/${workspace.id}`, {
          method: "PUT",
        }),
      ).toBe(true),
    );
  });

  it("should provision an unprovisioned workspace", async () => {
    const workspace = createMockWorkspace();
    setup({ workspace });

    await userEvent.click(
      await screen.findByRole("button", { name: "Provision workspace" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Provision workspace" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace/${workspace.id}/provision`,
          { method: "POST" },
        ),
      ).toBe(true),
    );
  });

  it("should deprovision a fully provisioned workspace", async () => {
    const workspace = createMockWorkspace({
      databases: [createMockWorkspaceDatabase({ status: "provisioned" })],
    });
    setup({ workspace });

    await userEvent.click(
      await screen.findByRole("button", { name: "Deprovision workspace" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Deprovision workspace" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace/${workspace.id}/deprovision`,
          { method: "POST" },
        ),
      ).toBe(true),
    );
  });

  it("should delete a workspace from the header menu", async () => {
    const workspace = createMockWorkspace();
    setup({ workspace });

    expect(await screen.findByDisplayValue(workspace.name)).toBeInTheDocument();
    await userEvent.click(getIcon("ellipsis"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete/ }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete workspace" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(`path:/api/ee/workspace/${workspace.id}`, {
          method: "DELETE",
        }),
      ).toBe(true),
    );
    expect(await screen.findByText("Workspace list")).toBeInTheDocument();
  });
});
