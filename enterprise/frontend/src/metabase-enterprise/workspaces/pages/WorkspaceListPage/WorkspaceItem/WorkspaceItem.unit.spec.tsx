import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockWorkspace } from "metabase-types/api/mocks";

import { WorkspaceItem } from "./WorkspaceItem";

const WORKSPACE = createMockWorkspace({ id: 1, name: "My workspace" });

function setup() {
  renderWithProviders(<WorkspaceItem workspace={WORKSPACE} />);
}

describe("WorkspaceItem", () => {
  it("renders the workspace name", () => {
    setup();
    expect(
      screen.getByRole("heading", { name: "My workspace" }),
    ).toBeInTheDocument();
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
