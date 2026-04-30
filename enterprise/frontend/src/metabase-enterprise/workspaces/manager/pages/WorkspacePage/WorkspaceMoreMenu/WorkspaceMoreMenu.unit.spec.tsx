import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupDeleteWorkspaceEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Urls from "metabase/utils/urls";
import { createMockWorkspace } from "metabase-types/api/mocks";

import { WorkspaceMoreMenu } from "./WorkspaceMoreMenu";

function setup() {
  const workspace = createMockWorkspace({ id: 7, name: "Acme analytics" });
  setupDeleteWorkspaceEndpoint(workspace.id);

  return {
    workspace,
    ...renderWithProviders(
      <Route
        path="/data-studio/workspaces/:workspaceId"
        component={() => <WorkspaceMoreMenu workspace={workspace} />}
      />,
      {
        withRouter: true,
        initialRoute: Urls.workspace(workspace.id),
      },
    ),
  };
}

async function openMenuAndClickDelete() {
  await userEvent.click(screen.getByRole("button"));
  await userEvent.click(await screen.findByRole("menuitem", { name: /Delete/i }));
}

describe("WorkspaceMoreMenu", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should not call DELETE until the user confirms", async () => {
    setup();

    await openMenuAndClickDelete();

    expect(
      await screen.findByText("Delete this workspace?"),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(/\/api\/ee\/workspace-manager\//),
    ).toHaveLength(0);
  });

  it("should DELETE the workspace and redirect to the list when confirmed", async () => {
    const { workspace, history } = setup();

    await openMenuAndClickDelete();
    await userEvent.click(
      await screen.findByRole("button", { name: /Delete workspace/i }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(
          `path:/api/ee/workspace-manager/${workspace.id}`,
        ),
      ).toHaveLength(1);
    });
    const [request] = fetchMock.callHistory.calls(
      `path:/api/ee/workspace-manager/${workspace.id}`,
    );
    expect(request.options.method).toBe("DELETE");

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe(Urls.workspaceList());
    });
  });

  it("should not call DELETE when the user cancels the confirmation", async () => {
    setup();

    await openMenuAndClickDelete();
    await userEvent.click(
      await screen.findByRole("button", { name: /Cancel/i }),
    );

    await waitFor(() => {
      expect(
        screen.queryByText("Delete this workspace?"),
      ).not.toBeInTheDocument();
    });
    expect(
      fetchMock.callHistory.calls(/\/api\/ee\/workspace-manager\//),
    ).toHaveLength(0);
  });
});
