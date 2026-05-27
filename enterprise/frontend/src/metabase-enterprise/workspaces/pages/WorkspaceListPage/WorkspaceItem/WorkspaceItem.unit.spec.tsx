import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/urls";
import {
  createMockDatabase,
  createMockWorkspace,
} from "metabase-types/api/mocks";

import { WorkspaceItem } from "./WorkspaceItem";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });
const WORKSPACE = createMockWorkspace({ id: 1, name: "My workspace" });

function setup() {
  renderWithProviders(
    <Route
      path="*"
      component={() => (
        <WorkspaceItem workspace={WORKSPACE} availableDatabases={[POSTGRES]} />
      )}
    />,
    { withRouter: true },
  );
}

describe("WorkspaceItem", () => {
  it("renders as a link to the workspace page", () => {
    setup();
    expect(
      screen.getByRole("region", { name: "My workspace" }),
    ).toHaveAttribute("href", Urls.workspace(WORKSPACE.id));
  });
});
