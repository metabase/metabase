import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupListWorkspacesEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Workspace } from "metabase-types/api";
import { createMockWorkspace } from "metabase-types/api/mocks";

import { WorkspaceListPage } from "./WorkspaceListPage";

type SetupOpts = {
  workspaces: Workspace[];
};

function setup({ workspaces }: SetupOpts) {
  setupListWorkspacesEndpoint(workspaces);
  renderWithProviders(
    <>
      <Route path="/data-studio/workspaces" component={WorkspaceListPage} />
      <Route
        path="/data-studio/workspaces/:workspaceId"
        component={() => <div>Workspace page</div>}
      />
    </>,
    { withRouter: true, initialRoute: "/data-studio/workspaces" },
  );
}

describe("WorkspaceListPage", () => {
  it("should list existing workspaces", async () => {
    setup({ workspaces: [createMockWorkspace({ name: "Analytics" })] });

    expect(await screen.findByText("Analytics")).toBeInTheDocument();
  });

  it("should link the New button to the new-workspace page", async () => {
    setup({ workspaces: [] });

    expect(await screen.findByRole("link", { name: /New/ })).toHaveAttribute(
      "href",
      "/data-studio/workspaces/new",
    );
  });

  it("should navigate to the workspace page when a row is clicked", async () => {
    setup({ workspaces: [createMockWorkspace({ name: "Analytics" })] });

    await userEvent.click(await screen.findByText("Analytics"));

    expect(await screen.findByText("Workspace page")).toBeInTheDocument();
  });
});
