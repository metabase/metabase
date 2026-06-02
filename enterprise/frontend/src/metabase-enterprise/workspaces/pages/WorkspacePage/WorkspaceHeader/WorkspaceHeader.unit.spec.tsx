import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDeleteWorkspaceEndpoint,
  setupUpdateWorkspaceEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockWorkspace } from "metabase-types/api/mocks";

import { WorkspaceHeader } from "./WorkspaceHeader";

const WORKSPACE = createMockWorkspace({ id: 1, name: "My workspace" });

function setup() {
  setupUpdateWorkspaceEndpoint({ ...WORKSPACE, name: "Renamed" });
  setupDeleteWorkspaceEndpoint(WORKSPACE.id);

  renderWithProviders(
    <Route
      path="*"
      component={() => <WorkspaceHeader workspace={WORKSPACE} />}
    />,
    {
      withRouter: true,
    },
  );
}

describe("WorkspaceHeader", () => {
  it("renames the workspace via PUT when the title input changes", async () => {
    setup();

    await userEvent.click(screen.getByTestId("workspace-name-input"));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    await userEvent.tab();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace-manager/${WORKSPACE.id}`,
          { method: "PUT" },
        ),
      ).toBe(true);
    });
    const request = fetchMock.callHistory.lastCall(
      `path:/api/ee/workspace-manager/${WORKSPACE.id}`,
      { method: "PUT" },
    )?.request;
    expect(await request?.json()).toEqual({ name: "Renamed" });
  });

  it("deletes the workspace via DELETE after confirming from the menu", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete workspace" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace-manager/${WORKSPACE.id}`,
          { method: "DELETE" },
        ),
      ).toBe(true);
    });
  });
});
