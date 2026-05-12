import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDeleteWorkspaceEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Urls from "metabase/urls";
import {
  createMockDatabase,
  createMockWorkspace,
} from "metabase-types/api/mocks";

import { WorkspaceSection } from "./WorkspaceSection";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });
const WORKSPACE = createMockWorkspace({ id: 1, name: "My workspace" });

function setup() {
  setupDeleteWorkspaceEndpoint(WORKSPACE.id);

  renderWithProviders(
    <WorkspaceSection workspace={WORKSPACE} availableDatabases={[POSTGRES]} />,
    { withRouter: true },
  );
}

describe("WorkspaceSection", () => {
  it("renders an Edit link pointing at the workspace page", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: /Edit/ }),
    ).toHaveAttribute("href", Urls.workspace(WORKSPACE.id));
  });

  it("renders a Download config.yml link with the right href", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: /Download config.yml/ }),
    ).toHaveAttribute(
      "href",
      `/api/ee/workspace-manager/${WORKSPACE.id}/config`,
    );
  });

  it("deletes the workspace via DELETE after confirming", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Workspace actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete" }),
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
