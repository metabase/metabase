import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDeleteWorkspaceEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { Workspace } from "metabase-types/api";
import {
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { WorkspaceMoreMenu } from "./WorkspaceMoreMenu";

type SetupOpts = {
  workspace: Workspace;
};

function setup({ workspace }: SetupOpts) {
  setupDeleteWorkspaceEndpoint(workspace.id);
  renderWithProviders(<WorkspaceMoreMenu workspace={workspace} />);
}

describe("WorkspaceMoreMenu", () => {
  it("should delete an unprovisioned workspace", async () => {
    const workspace = createMockWorkspace();
    setup({ workspace });

    await userEvent.click(screen.getByRole("button"));
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
  });

  it("should disable delete when any database is still provisioned", async () => {
    setup({
      workspace: createMockWorkspace({
        databases: [createMockWorkspaceDatabase({ status: "provisioned" })],
      }),
    });

    await userEvent.click(screen.getByRole("button"));
    const item = await screen.findByRole("menuitem", { name: /Delete/ });
    expect(item).toHaveAttribute("data-disabled");
  });
});
