import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDeleteWorkspaceEndpoint,
  setupUserEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser, createMockWorkspace } from "metabase-types/api/mocks";

import { WorkspaceMenu } from "./WorkspaceMenu";

const WORKSPACE = createMockWorkspace({ id: 10, branch: "feature/x" });

function setup() {
  const currentUser = createMockUser({ id: 1 });
  setupUserEndpoints(currentUser);
  setupDeleteWorkspaceEndpoint(WORKSPACE.id);

  renderWithProviders(<WorkspaceMenu workspace={WORKSPACE} />, {
    storeInitialState: createMockState({ currentUser }),
  });
}

async function openMenu() {
  await userEvent.click(screen.getByLabelText("Workspace actions"));
}

describe("WorkspaceMenu", () => {
  it("should only offer the Delete action", async () => {
    setup();
    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: /delete/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /enter workspace/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /leave workspace/i }),
    ).not.toBeInTheDocument();
  });

  it("should show a confirmation dialog before deleting a workspace", async () => {
    setup();
    await openMenu();

    await userEvent.click(
      await screen.findByRole("menuitem", { name: /delete/i }),
    );

    expect(
      await screen.findByRole("dialog", { name: /delete this workspace/i }),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/ee/workspace/10", {
        method: "DELETE",
      }),
    ).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/workspace/10", {
          method: "DELETE",
        }),
      ).toHaveLength(1);
    });
  });
});
