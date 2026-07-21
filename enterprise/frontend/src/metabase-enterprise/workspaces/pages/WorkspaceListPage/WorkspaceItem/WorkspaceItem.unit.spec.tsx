import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupGetWorkspaceEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { User } from "metabase-types/api";
import {
  createMockDatabase,
  createMockUser,
  createMockUserInfo,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceItem } from "./WorkspaceItem";

const WORKSPACE = createMockWorkspace({ id: 1, name: "My workspace" });

function setup({
  workspace = WORKSPACE,
  currentUser = createMockUser(),
}: { workspace?: typeof WORKSPACE; currentUser?: User } = {}) {
  // The delete modal fetches the hydrated workspace when opened.
  setupGetWorkspaceEndpoint(workspace);
  renderWithProviders(<WorkspaceItem workspace={workspace} />, {
    storeInitialState: createMockState({ currentUser }),
  });
}

describe("WorkspaceItem", () => {
  it("renders the workspace name", () => {
    setup();
    expect(screen.getByText("My workspace")).toBeInTheDocument();
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

  it("warns when a database is not provisioned", () => {
    setup({
      workspace: createMockWorkspace({
        id: 1,
        name: "My workspace",
        databases: [
          createMockWorkspaceDatabase({
            database_id: 10,
            status: "unprovisioned",
            database: createMockDatabase({ id: 10, name: "Postgres" }),
          }),
        ],
      }),
    });

    expect(
      screen.getByText("Failed to provision the workspace."),
    ).toBeInTheDocument();
    expect(screen.getByText("Postgres")).toBeInTheDocument();
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

  it("offers to enter the workspace when the user is not in it", async () => {
    fetchMock.post(`/api/ee/workspace/${WORKSPACE.id}/enter`, 200);
    fetchMock.get("/api/user/current", createMockUser());
    setup({ currentUser: createMockUser({ workspace_id: null }) });
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Enter workspace" }),
    );

    expect(
      fetchMock.callHistory.called(`/api/ee/workspace/${WORKSPACE.id}/enter`),
    ).toBe(true);
  });

  it("offers to leave the workspace when the user is working in it", async () => {
    fetchMock.post("/api/ee/workspace/exit", 200);
    fetchMock.get("/api/user/current", createMockUser());
    setup({ currentUser: createMockUser({ workspace_id: WORKSPACE.id }) });
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Leave workspace" }),
    );

    expect(fetchMock.callHistory.called("/api/ee/workspace/exit")).toBe(true);
  });

  it("opens the rename modal from the menu", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace options" }),
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
      screen.getByRole("button", { name: "Workspace options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Delete this workspace?" }),
    ).toBeInTheDocument();
  });
});
