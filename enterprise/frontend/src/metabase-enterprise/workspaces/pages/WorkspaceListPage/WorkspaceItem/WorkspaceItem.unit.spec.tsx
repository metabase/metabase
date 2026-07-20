import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDeleteWorkspaceEndpoint,
  setupDeprovisionWorkspaceEndpoint,
  setupGetWorkspaceEndpoint,
  setupProvisionWorkspaceEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockDatabase,
  createMockUserInfo,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceItem } from "./WorkspaceItem";

const WORKSPACE = createMockWorkspace({ id: 1, name: "My workspace" });

function setup({ workspace = WORKSPACE } = {}) {
  // The delete modal fetches the hydrated workspace when opened.
  setupGetWorkspaceEndpoint(workspace);
  renderWithProviders(<WorkspaceItem workspace={workspace} />);
}

describe("WorkspaceItem", () => {
  it("renders the workspace name", () => {
    setup();
    expect(screen.getByText("My workspace")).toBeInTheDocument();
  });

  it("provisions from the menu after confirmation", async () => {
    const workspace = createMockWorkspace({
      name: "My workspace",
      status: "unprovisioned",
    });
    setupProvisionWorkspaceEndpoint(workspace);
    setup({ workspace });

    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Provision" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Provision workspace" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Provision" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace-manager/${workspace.id}/provision`,
          { method: "POST" },
        ),
      ).toBe(true);
    });
  });

  it("deprovisions from the menu after confirmation", async () => {
    const workspace = createMockWorkspace({
      name: "My workspace",
      status: "provisioned",
    });
    setupDeprovisionWorkspaceEndpoint(workspace);
    setup({ workspace });

    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Deprovision" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Deprovision workspace",
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Deprovision" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace-manager/${workspace.id}/deprovision`,
          { method: "POST" },
        ),
      ).toBe(true);
    });
  });

  it("disables Provision when provisioned and Deprovision when unprovisioned", async () => {
    setup({
      workspace: createMockWorkspace({
        name: "My workspace",
        status: "provisioned",
      }),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Provision" }),
    ).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Deprovision" })).toBeEnabled();
  });

  it("disables Deprovision and enables Provision when unprovisioned", async () => {
    setup({
      workspace: createMockWorkspace({
        name: "My workspace",
        status: "unprovisioned",
      }),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Deprovision" }),
    ).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Provision" })).toBeEnabled();
  });

  it("disables Provision and Deprovision while a run is in flight", async () => {
    setup({
      workspace: createMockWorkspace({
        name: "My workspace",
        status: "database-provisioning",
      }),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Provision" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("menuitem", { name: "Deprovision" }),
    ).toBeDisabled();
  });

  it("shows status details in a modal via the See details button", async () => {
    setup({
      workspace: createMockWorkspace({
        name: "My workspace",
        status: "database-provisioning-failure",
        status_details: "warehouse down",
      }),
    });

    expect(screen.getByText("Failed to set up databases")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "See details" }));

    const modal = await screen.findByRole("dialog");
    expect(modal).toHaveTextContent("Failed to set up databases");
    expect(modal).toHaveTextContent("warehouse down");
  });

  it("does not offer status details when there are none", () => {
    setup({
      workspace: createMockWorkspace({
        name: "My workspace",
        status: "unprovisioned",
        status_details: null,
      }),
    });

    expect(screen.getByText("Not provisioned")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "See details" }),
    ).not.toBeInTheDocument();
  });

  it("shows the instance link instead of the status when provisioned", () => {
    setup({
      workspace: createMockWorkspace({
        name: "My workspace",
        status: "provisioned",
        instance_url: "https://workspace.example.com",
      }),
    });

    expect(
      screen.getByRole("link", { name: "https://workspace.example.com" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Provisioned")).not.toBeInTheDocument();
  });

  it("renders the creator info when the creator is hydrated", () => {
    setup({
      workspace: createMockWorkspace({
        name: "My workspace",
        creator: createMockUserInfo({
          first_name: "Ada",
          last_name: "Lovelace",
        }),
      }),
    });

    expect(screen.getByText(/Created by Ada Lovelace/)).toBeInTheDocument();
  });

  it("renders plain creation info when the creator is missing", () => {
    setup({
      workspace: createMockWorkspace({ name: "My workspace", creator: null }),
    });

    expect(screen.getByText(/^Created /)).toBeInTheDocument();
  });

  it("renders databases, falling back to the id when not hydrated", () => {
    setup({
      workspace: createMockWorkspace({
        id: 1,
        name: "My workspace",
        databases: [
          createMockWorkspaceDatabase({
            database_id: 10,
            database: createMockDatabase({ id: 10, name: "Postgres" }),
          }),
          createMockWorkspaceDatabase({
            database_id: 20,
            database: null,
          }),
        ],
      }),
    });

    expect(screen.getByText("Postgres")).toBeInTheDocument();
    expect(screen.getByText("Database 20")).toBeInTheDocument();
  });

  it("does not warn when all databases are provisioned", () => {
    setup({
      workspace: createMockWorkspace({
        id: 1,
        name: "My workspace",
        databases: [
          createMockWorkspaceDatabase({
            database_id: 10,
            status: "provisioned",
            database: createMockDatabase({ id: 10, name: "Postgres" }),
          }),
        ],
      }),
    });

    expect(
      screen.queryByText("Failed to provision the workspace."),
    ).not.toBeInTheDocument();
  });

  it("opens the rename modal from the menu", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Rename" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Rename this workspace?" }),
    ).toBeInTheDocument();
  });

  it("disables Delete unless the workspace is fully deprovisioned", async () => {
    setup({
      workspace: createMockWorkspace({
        name: "My workspace",
        status: "provisioned",
      }),
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Delete" }),
    ).toBeDisabled();
  });

  it("deletes an unprovisioned workspace from the menu after confirmation", async () => {
    const workspace = createMockWorkspace({
      name: "My workspace",
      status: "unprovisioned",
    });
    setupDeleteWorkspaceEndpoint(workspace.id);
    setup({ workspace });

    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Delete workspace" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace-manager/${workspace.id}`,
          { method: "DELETE" },
        ),
      ).toBe(true);
    });
  });
});
