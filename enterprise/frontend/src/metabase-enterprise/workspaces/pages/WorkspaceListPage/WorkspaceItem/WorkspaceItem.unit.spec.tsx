import userEvent from "@testing-library/user-event";

import { setupGetWorkspaceEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
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
  renderWithProviders(
    <Route
      path="*"
      component={() => <WorkspaceItem workspace={workspace} />}
    />,
    { withRouter: true },
  );
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

  it("links to the child instance when instance_url is set", () => {
    setup({
      workspace: createMockWorkspace({
        name: "My workspace",
        instance_url: "https://child.example.com",
      }),
    });

    expect(
      screen.getByRole("link", { name: "https://child.example.com" }),
    ).toHaveAttribute("href", "https://child.example.com");
  });

  it("does not render an instance link when instance_url is not set", () => {
    setup();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
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
