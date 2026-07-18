import userEvent from "@testing-library/user-event";

import { setupGetWorkspaceEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
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
        status: "provisioned",
        status_details: null,
      }),
    });

    expect(screen.getByText("Provisioned")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "See details" }),
    ).not.toBeInTheDocument();
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

  it("opens the delete modal from the menu", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Delete this workspace?" }),
    ).toBeInTheDocument();
  });
});
