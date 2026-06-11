import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDatabase,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceItem } from "./WorkspaceItem";

const WORKSPACE = createMockWorkspace({ id: 1, name: "My workspace" });

function setup({ workspace = WORKSPACE } = {}) {
  renderWithProviders(<WorkspaceItem workspace={workspace} />);
}

describe("WorkspaceItem", () => {
  it("renders the workspace name", () => {
    setup();
    expect(
      screen.getByRole("heading", { name: "My workspace" }),
    ).toBeInTheDocument();
  });

  it("renders only hydrated databases", () => {
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
  });

  it("offers a config download link in the menu", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace options" }),
    );

    const downloadItem = await screen.findByRole("menuitem", {
      name: /Download config\.yml/,
    });
    expect(downloadItem).toHaveAttribute(
      "href",
      `/api/ee/workspace-manager/${WORKSPACE.id}/config`,
    );
    expect(downloadItem).toHaveAttribute("download", "config.yml");
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
